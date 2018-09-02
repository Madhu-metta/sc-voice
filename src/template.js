(function(exports) {
    const fs = require('fs');
    const path = require('path');
    const Words = require('./words');

    class Template {
        constructor(segments, alternates, opts={}) {
            if (!(segments instanceof Array)) {
                throw new Error('expected Array of segments');
            }
            this.segments = segments;
            if (typeof alternates === 'string') {
                alternates = [alternates];
            }
            if (!(alternates instanceof Array)) {
                throw new Error('expected array of alternates');
            }
            this.alternates = alternates;
            this.reAlternates = new RegExp(`${alternates.join('|')}`,'u');
            this.prop = opts.prop || 'en';
            this.prefixLen = segments[0][this.prop].indexOf(alternates[0]);
        }

        expand(segment) {
            var src = this.segments[0][this.prop];
            var dst = segment[this.prop];
            var dstTokens = dst.split(this.reAlternates);
            if (dstTokens.length < 2) {
                throw new Error(`could not find anything to expand:${dst}`);
            }
            var repLen = (dst.length - dstTokens.join('').length)/(dstTokens.length-1);
            var repStart = dstTokens[0].length;
            var replacement = dst.substring(repStart,repStart+repLen);
            var scid = segment.scid;
            return this.segments.map((seg,i) => {
                var re = new RegExp(this.alternates[0], 'ug'); // WARNING: RegExp g is stateful
                var propCopy = seg[this.prop].replace(re, replacement);
                if (i === 0 && dstTokens[0]) {
                    propCopy = dstTokens[0] + propCopy.substring(this.prefixLen);
                }
                return {
                    scid: `${scid}.${i+1}`,
                    [this.prop]: propCopy,
                };
            });
        }

    }

    module.exports = exports.Template = Template;
})(typeof exports === "object" ? exports : (exports = {}));
