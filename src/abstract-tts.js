(function(exports) {
    const fs = require('fs');
    const path = require('path');
    const winston = require('winston');
    const { MerkleJson } = require('merkle-json');
    const SoundStore = require('./sound-store');
    const ABSTRACT_METHOD = "abstract method must be overridden and implemented by base class";

    class AbstractTTS {
        constructor(opts={}) {
            this.hits = 0;
            this.misses = 0;
            this.voice = null;
            this.api = null;
            this.mj = new MerkleJson({
                hashTag: 'guid',
            });
            var wordpath = path.join(__dirname, `../words/${this.language}.json`);
            if (!fs.existsSync(wordpath)) {
                var wordpath = path.join(__dirname, `../words/en.json`);
            }
            this.store = new SoundStore();
            Object.defineProperty(this, 'credentials', {
                writable: true,
            });
            Object.defineProperty(this, 'words', {
                value: JSON.parse(fs.readFileSync(wordpath)),
            });
            var symbols = this.words._symbols;
            var symAcc= Object.keys(symbols).reduce((acc,text) => {
                if (text === ']') {
                    text = '\\' + text;
                }
                acc.text += text;
                return acc;
            }, { text: '' });
            this.symbolPat = new RegExp(`[${symAcc.text}]`);
            this.audioMIME = opts.audioMIME || 'audio/ogg';
            this.prosody = opts.prosody || {
                rate: "-10%",
            };
            this.breaks = opts.breaks || [0,0.1,0.2,0.4,0.8];
            this.output = opts.output || {
                path: path.join(__dirname, '../local/audio'),
                file: 'output.ogg',
            };
        }

        get ERROR_SIZE() { return 1000 }

        get username() {
            return this.credentials && this.credentials.username;
        }

        get password() {
            return this.credentials && this.credentials.password;
        }

        set username(value) {
            this.credentials == null && (this.credentials = {});
            this.credentials.username = value;
            return value;
        }

        set password(value) {
            this.credentials == null && (this.credentials = {});
            this.credentials.password = value;
            return value;
        }

        break(index) {
            return `<break time="${index}s"></break>`;
        }

        wordInfo(word) {
            word = word && word.toLowerCase();
            var wordValue = word && this.words[word];
            if (typeof wordValue === 'string') { // synonym
                wordValue = this.wordInfo(wordValue);
            }
            return wordValue || null;
        }

        wordSSML(word) {
            var wordInfo = this.wordInfo(word);
            if (wordInfo) {
                var ipa = wordInfo.ipa;
                if (ipa.endsWith('(.)')) {
                    var pauses = ipa.split('(.)');
                    ipa = pauses.map(x => {
                        return x && `<phoneme alphabet="ipa" ph="${x}">${word}</phoneme>` || '';
                    }).join(this.break(1));
                    return ipa;
                } else {
                    return `<phoneme alphabet="ipa" ph="${ipa}">${word}</phoneme>`;
                }
            } else {
                return word;
            }
        }

        tokenize(text) {
            return text.split(' ').reduce((acc,t) => {
                for (var matches;  (matches = this.symbolPat.exec(t)); ) {
                    matches.index && acc.push(t.substring(0, matches.index));
                    acc.push(t.substring(matches.index,matches.index+1));
                    t = t.substring(matches.index+1);
                }
                t && acc.push(t);
                return acc;
            }, []);
        }

        tokensSSML(text) {
            var tokens = text instanceof Array ? text : this.tokenize(text);
            var tokensSSML = tokens.map(token => {
                return this.wordSSML(token) || token;
            });
            return tokensSSML;
        }

        segment(tokens) {
            var symbols = this.words._symbols;
            var acc = tokens.reduce((acc,token) => {
                if (token.length === 1 && this.symbolPat.test(token)) {
                    var symbol = symbols[token];
                    if (symbol == null) {
                        throw new Error(`undefined symbol: ${token}`);
                    }
                    acc.cuddle = symbol.cuddle;
                    if (acc.cuddle === 'left') {
                        acc.segment = acc.segment + token;
                    } else {
                        acc.segment = acc.segment ? acc.segment + ' ' + token : token;
                    }
                    if (symbols[token].endSegment) {
                        acc.segments.push(acc.segment);
                        acc.segment = '';
                    }
                } else {
                    if (acc.cuddle === 'right') {
                        acc.segment = acc.segment + token;
                    } else {
                        acc.segment = acc.segment ? acc.segment + ' ' + token : token;
                    }
                    acc.cuddle = null;
                }
                return acc;
            }, {
                segments: [],
                segment: '',
                cuddle: null,
            });
            acc.segment && acc.segments.push(acc.segment);
            return acc.segments;
        }

        segmentSSML(text) {
            return this.segment(this.tokensSSML(text));
        }

        signature(text) {
            var json = {
                api: this.api,
                audioMIME: this.audioMIME,
                voice: this.voice,
                prosody: this.prosody,
                text,
            }
            json[this.mj.hashTag] = this.mj.hash(json);
            return json;
        }
        
        synthesizeResponse(resolve, reject, request) {
            var hitPct = (100*this.hits/(this.hits+this.misses)).toFixed(1);
            var outpath = request.outpath;
            var stats = fs.existsSync(outpath) && fs.statSync(outpath);
            if (stats && stats.size <= this.ERROR_SIZE) {
                var err = fs.readFileSync(outpath).toString();
                console.log(`synthesize() failed ${outpath}`, stats.size, err);
                reject(new Error(err));
            }
            resolve(this.createResponse(request, stats));
        }

        createResponse(request, stats) {
            var signature = request.signature;
            var jsonPath = this.store.signaturePath(signature, ".json");
            fs.writeFileSync(jsonPath, JSON.stringify(signature, null, 2));
            return {
                file: request.outpath,
                stats,
                hits: this.hits,
                misses: this.misses,
                signature,
                cached: false,
            };
        }

        synthesizeSSML(ssmlFragment, opts={}) {
            return new Promise((resolve, reject) => {
                try {
                    var cache = opts.cache == null ? true : opts.cache;
                    var rate = this.prosody.rate || "0%";
                    var pitch = this.prosody.pitch || "0%";
                    var ssml = `<prosody rate="${rate}" pitch="${pitch}">${ssmlFragment}</prosody>`;
                    var signature = this.signature(ssml);
                    var outpath = this.store.signaturePath(signature);
                    var request = {
                        ssml,
                        signature,
                        outpath,
                    };

                    var stats = fs.existsSync(outpath) && fs.statSync(outpath);
                    if (cache && stats && stats.size > this.ERROR_SIZE) {
                        this.hits++;
                        resolve(this.createResponse(request, stats));
                    } else {
                        this.misses++;

                        this.serviceSynthesize(resolve, error => {
                            console.log(`synthesize() error:`, error.stack);
                            reject(error);
                        }, request);
                    }
                } catch (e) {
                    reject(e);
                }
            });
        }

        synthesizeText(text, opts={}) {
            var that = this;
            return new Promise((resolve, reject) => {
                (async function() {
                    var result = null;
                    if (typeof text === 'string') {
                        var promises = that.segmentSSML(text).map(ssml => that.synthesizeSSML(ssml, opts));
                        result = await Promise.all(promises);
                    } else if (text instanceof Array) {
                        var textArray = text;
                        //var promises = textArray.map(t => that.synthesizeText(t));
                        var promises = textArray.reduce((acc, t) => {
                            that.segmentSSML(t).forEach(ssml => {
                                acc.push(that.synthesizeSSML(ssml, opts));
                            });
                            return acc;
                        }, []);
                        result = await Promise.all(promises);
                    }
                    if (result) {
                        var files = result.map(r => r.file);
                        var inputs = `file '${files.join("'\nfile '")}'\n`;
                        console.log('inputs\n'+inputs);
                        resolve(result);
                    } else {
                        reject(new Error("synthesizeText(text?) expected string or Array"));
                    }
                })();
            });
        }

        serviceSynthesize(resolve, reject, request) {
            reject (new Error(ABSTRACT_METHOD));
        }

    }

    module.exports = exports.AbstractTTS = AbstractTTS;
})(typeof exports === "object" ? exports : (exports = {}));

