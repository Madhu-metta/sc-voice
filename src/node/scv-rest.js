
(function(exports) {
    const winston = require('winston');
    const fs = require('fs');
    const path = require('path');
    const {
        RestBundle,
    } = require('rest-bundle');
    const srcPkg = require("../../package.json");
    const Words = require('./words');
    const Section = require('./section');
    const Sutta = require('./sutta');
    const SuttaFactory = require('./sutta-factory');
    const PoParser = require('./po-parser');
    const Voice = require('./voice');
    const SuttaCentralId = require('./sutta-central-id');
    const PATH_SOUNDS = path.join(__dirname, '../../local/sounds/');

    const SUPPORTED_SUTTAS = {
        mn1: true,
    };
    const SUPPORTED_TRANSLATORS = {
        sujato: true,
    };

    class ScvRest extends RestBundle { 
        constructor(opts = {}) {
            super(opts.name || 'scv', Object.assign({
                srcPkg,
            }, opts));
            winston.info(`ScvRest.ctor(${this.name})`);
            Object.defineProperty(this, "handlers", {
                value: super.handlers.concat([
                    this.resourceMethod("get", "recite/section/:suttaId/:translator/:iSection", 
                        this.getReciteSection),
                    this.resourceMethod("get", "audio/:guid", this.getAudio, 'audio/ogg'),

                ]),
            });
        }

        getAudio(req, res, next) {
            return new Promise((resolve, reject) => { try {
                var guid = req.params.guid;
                var folder = guid.substring(0, 2);
                var root = path.join(PATH_SOUNDS, guid.substring(0,2));
                var filePath = path.join(root, `${guid}.ogg`);
                var data = fs.readFileSync(filePath);
                resolve(data);
            } catch (e) { reject(e) } });
        }

        getReciteSection(req, res, next) {
            var suttaId = req.params.suttaId || 'mn1';
            if (SUPPORTED_SUTTAS[suttaId] !== true) {
                return Promise.reject(new Error(`Sc-Voice does not support sutta: ${suttaId}`));
            }
            var translator = req.params.translator || 'sujato';
            if (SUPPORTED_TRANSLATORS[translator] !== true) {
                return Promise.reject(new Error(`Sc-Voice does not support translator: ${translator}`));
            }
            var iSection = Number(req.params.iSection == null ? 0 : req.params.iSection);
            return new Promise((resolve, reject) => {
                (async function() { try {
                    var sutta = await SuttaFactory.loadSutta(suttaId);
                    var expandedSutta = new SuttaFactory().expandSutta(sutta);
                    if (iSection < 0 || expandedSutta.sections.length <= iSection) {
                        throw new Error(`Sutta ${suttaId}/${translator} has no section:${iSection}`);
                    }
                    var voice = Voice.createVoice({
                        name: "amy",
                        languageUnknown: "pli",
                    });
                    var lines = Sutta.textOfSegments(expandedSutta.sections[iSection].segments);
                    var text = `${lines.join('\n')}\n`;
                    var result = await voice.speak(text, {
                        cache: true, // false: use TTS web service for every request
                        usage: "recite",
                    });
                    resolve(result);
                } catch(e) { reject(e); } })();
            });
        }
    }

    module.exports = exports.ScvRest = ScvRest;
})(typeof exports === "object" ? exports : (exports = {}));

