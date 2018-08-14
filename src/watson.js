(function(exports) {
    const fs = require('fs');
    const path = require('path');
    const winston = require('winston');
    const TextToSpeechV1 = require('watson-developer-cloud/text-to-speech/v1');
    const AbstractTTS = require('./abstract-tts');

    class Watson extends AbstractTTS {
        constructor(opts={}) {
            super(opts);
            var credentials = opts.credentials;
            if (credentials == null) {
                var credpath = path.join(__dirname, '../local/watson/credentials.json');
                if (fs.existsSync(credpath)) {
                    credentials = JSON.parse(fs.readFileSync(credpath));
                }
            }
            this.credentials = credentials;
            this.voice = opts.voice || 'en-GB_KateVoice';
            this.prosody.pitch = "-30%";
            this.language = this.voice.split('-')[0];
            this.service_url = opts.service_url || "https://stream.watsonplatform.net/text-to-speech/api/v1";
            this.api = opts.api || 'watson/text-to-speech/v1';
        }

        get textToSpeech() {
            if (this._textToSpeech == null) {
                this._textToSpeech = new TextToSpeechV1(this.credentials);
            }
            return this._textToSpeech;
        }

        serviceSynthesize(resolve, reject, request) {
            var ostream = fs.createWriteStream(outpath);
            var serviceParams = {
                text: request.ssml,
                accept: request.audioMIME,
                voice: request.voice,
            };
            this.textToSpeech.synthesize(serviceParams)
            .on('error', error => reject(error) )
            .on('end', () => this.synthesizeResponse(resolve, reject, request) )
            .pipe(ostream);
        }
    }

    module.exports = exports.Watson = Watson;
})(typeof exports === "object" ? exports : (exports = {}));

