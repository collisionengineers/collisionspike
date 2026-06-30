const __importMetaUrl = require('url').pathToFileURL(__filename).href;
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/postgres-array/index.js
var require_postgres_array = __commonJS({
  "node_modules/postgres-array/index.js"(exports2) {
    "use strict";
    exports2.parse = function(source, transform) {
      return new ArrayParser(source, transform).parse();
    };
    var ArrayParser = class _ArrayParser {
      constructor(source, transform) {
        this.source = source;
        this.transform = transform || identity;
        this.position = 0;
        this.entries = [];
        this.recorded = [];
        this.dimension = 0;
      }
      isEof() {
        return this.position >= this.source.length;
      }
      nextCharacter() {
        var character = this.source[this.position++];
        if (character === "\\") {
          return {
            value: this.source[this.position++],
            escaped: true
          };
        }
        return {
          value: character,
          escaped: false
        };
      }
      record(character) {
        this.recorded.push(character);
      }
      newEntry(includeEmpty) {
        var entry;
        if (this.recorded.length > 0 || includeEmpty) {
          entry = this.recorded.join("");
          if (entry === "NULL" && !includeEmpty) {
            entry = null;
          }
          if (entry !== null) entry = this.transform(entry);
          this.entries.push(entry);
          this.recorded = [];
        }
      }
      consumeDimensions() {
        if (this.source[0] === "[") {
          while (!this.isEof()) {
            var char = this.nextCharacter();
            if (char.value === "=") break;
          }
        }
      }
      parse(nested) {
        var character, parser, quote;
        this.consumeDimensions();
        while (!this.isEof()) {
          character = this.nextCharacter();
          if (character.value === "{" && !quote) {
            this.dimension++;
            if (this.dimension > 1) {
              parser = new _ArrayParser(this.source.substr(this.position - 1), this.transform);
              this.entries.push(parser.parse(true));
              this.position += parser.position - 2;
            }
          } else if (character.value === "}" && !quote) {
            this.dimension--;
            if (!this.dimension) {
              this.newEntry();
              if (nested) return this.entries;
            }
          } else if (character.value === '"' && !character.escaped) {
            if (quote) this.newEntry(true);
            quote = !quote;
          } else if (character.value === "," && !quote) {
            this.newEntry();
          } else {
            this.record(character.value);
          }
        }
        if (this.dimension !== 0) {
          throw new Error("array dimension not balanced");
        }
        return this.entries;
      }
    };
    function identity(value) {
      return value;
    }
  }
});

// node_modules/pg-types/lib/arrayParser.js
var require_arrayParser = __commonJS({
  "node_modules/pg-types/lib/arrayParser.js"(exports2, module2) {
    var array = require_postgres_array();
    module2.exports = {
      create: function(source, transform) {
        return {
          parse: function() {
            return array.parse(source, transform);
          }
        };
      }
    };
  }
});

// node_modules/postgres-date/index.js
var require_postgres_date = __commonJS({
  "node_modules/postgres-date/index.js"(exports2, module2) {
    "use strict";
    var DATE_TIME = /(\d{1,})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(\.\d{1,})?.*?( BC)?$/;
    var DATE = /^(\d{1,})-(\d{2})-(\d{2})( BC)?$/;
    var TIME_ZONE = /([Z+-])(\d{2})?:?(\d{2})?:?(\d{2})?/;
    var INFINITY = /^-?infinity$/;
    module2.exports = function parseDate(isoDate) {
      if (INFINITY.test(isoDate)) {
        return Number(isoDate.replace("i", "I"));
      }
      var matches = DATE_TIME.exec(isoDate);
      if (!matches) {
        return getDate(isoDate) || null;
      }
      var isBC = !!matches[8];
      var year2 = parseInt(matches[1], 10);
      if (isBC) {
        year2 = bcYearToNegativeYear(year2);
      }
      var month = parseInt(matches[2], 10) - 1;
      var day2 = matches[3];
      var hour2 = parseInt(matches[4], 10);
      var minute2 = parseInt(matches[5], 10);
      var second = parseInt(matches[6], 10);
      var ms = matches[7];
      ms = ms ? 1e3 * parseFloat(ms) : 0;
      var date;
      var offset = timeZoneOffset(isoDate);
      if (offset != null) {
        date = new Date(Date.UTC(year2, month, day2, hour2, minute2, second, ms));
        if (is0To99(year2)) {
          date.setUTCFullYear(year2);
        }
        if (offset !== 0) {
          date.setTime(date.getTime() - offset);
        }
      } else {
        date = new Date(year2, month, day2, hour2, minute2, second, ms);
        if (is0To99(year2)) {
          date.setFullYear(year2);
        }
      }
      return date;
    };
    function getDate(isoDate) {
      var matches = DATE.exec(isoDate);
      if (!matches) {
        return;
      }
      var year2 = parseInt(matches[1], 10);
      var isBC = !!matches[4];
      if (isBC) {
        year2 = bcYearToNegativeYear(year2);
      }
      var month = parseInt(matches[2], 10) - 1;
      var day2 = matches[3];
      var date = new Date(year2, month, day2);
      if (is0To99(year2)) {
        date.setFullYear(year2);
      }
      return date;
    }
    function timeZoneOffset(isoDate) {
      if (isoDate.endsWith("+00")) {
        return 0;
      }
      var zone = TIME_ZONE.exec(isoDate.split(" ")[1]);
      if (!zone) return;
      var type = zone[1];
      if (type === "Z") {
        return 0;
      }
      var sign3 = type === "-" ? -1 : 1;
      var offset = parseInt(zone[2], 10) * 3600 + parseInt(zone[3] || 0, 10) * 60 + parseInt(zone[4] || 0, 10);
      return offset * sign3 * 1e3;
    }
    function bcYearToNegativeYear(year2) {
      return -(year2 - 1);
    }
    function is0To99(num) {
      return num >= 0 && num < 100;
    }
  }
});

// node_modules/xtend/mutable.js
var require_mutable = __commonJS({
  "node_modules/xtend/mutable.js"(exports2, module2) {
    module2.exports = extend;
    var hasOwnProperty = Object.prototype.hasOwnProperty;
    function extend(target) {
      for (var i = 1; i < arguments.length; i++) {
        var source = arguments[i];
        for (var key in source) {
          if (hasOwnProperty.call(source, key)) {
            target[key] = source[key];
          }
        }
      }
      return target;
    }
  }
});

// node_modules/postgres-interval/index.js
var require_postgres_interval = __commonJS({
  "node_modules/postgres-interval/index.js"(exports2, module2) {
    "use strict";
    var extend = require_mutable();
    module2.exports = PostgresInterval;
    function PostgresInterval(raw) {
      if (!(this instanceof PostgresInterval)) {
        return new PostgresInterval(raw);
      }
      extend(this, parse2(raw));
    }
    var properties = ["seconds", "minutes", "hours", "days", "months", "years"];
    PostgresInterval.prototype.toPostgres = function() {
      var filtered = properties.filter(this.hasOwnProperty, this);
      if (this.milliseconds && filtered.indexOf("seconds") < 0) {
        filtered.push("seconds");
      }
      if (filtered.length === 0) return "0";
      return filtered.map(function(property) {
        var value = this[property] || 0;
        if (property === "seconds" && this.milliseconds) {
          value = (value + this.milliseconds / 1e3).toFixed(6).replace(/\.?0+$/, "");
        }
        return value + " " + property;
      }, this).join(" ");
    };
    var propertiesISOEquivalent = {
      years: "Y",
      months: "M",
      days: "D",
      hours: "H",
      minutes: "M",
      seconds: "S"
    };
    var dateProperties = ["years", "months", "days"];
    var timeProperties = ["hours", "minutes", "seconds"];
    PostgresInterval.prototype.toISOString = PostgresInterval.prototype.toISO = function() {
      var datePart = dateProperties.map(buildProperty, this).join("");
      var timePart = timeProperties.map(buildProperty, this).join("");
      return "P" + datePart + "T" + timePart;
      function buildProperty(property) {
        var value = this[property] || 0;
        if (property === "seconds" && this.milliseconds) {
          value = (value + this.milliseconds / 1e3).toFixed(6).replace(/0+$/, "");
        }
        return value + propertiesISOEquivalent[property];
      }
    };
    var NUMBER = "([+-]?\\d+)";
    var YEAR = NUMBER + "\\s+years?";
    var MONTH = NUMBER + "\\s+mons?";
    var DAY = NUMBER + "\\s+days?";
    var TIME = "([+-])?([\\d]*):(\\d\\d):(\\d\\d)\\.?(\\d{1,6})?";
    var INTERVAL = new RegExp([YEAR, MONTH, DAY, TIME].map(function(regexString) {
      return "(" + regexString + ")?";
    }).join("\\s*"));
    var positions = {
      years: 2,
      months: 4,
      days: 6,
      hours: 9,
      minutes: 10,
      seconds: 11,
      milliseconds: 12
    };
    var negatives = ["hours", "minutes", "seconds", "milliseconds"];
    function parseMilliseconds(fraction) {
      var microseconds = fraction + "000000".slice(fraction.length);
      return parseInt(microseconds, 10) / 1e3;
    }
    function parse2(interval) {
      if (!interval) return {};
      var matches = INTERVAL.exec(interval);
      var isNegative = matches[8] === "-";
      return Object.keys(positions).reduce(function(parsed, property) {
        var position = positions[property];
        var value = matches[position];
        if (!value) return parsed;
        value = property === "milliseconds" ? parseMilliseconds(value) : parseInt(value, 10);
        if (!value) return parsed;
        if (isNegative && ~negatives.indexOf(property)) {
          value *= -1;
        }
        parsed[property] = value;
        return parsed;
      }, {});
    }
  }
});

// node_modules/postgres-bytea/index.js
var require_postgres_bytea = __commonJS({
  "node_modules/postgres-bytea/index.js"(exports2, module2) {
    "use strict";
    var bufferFrom = Buffer.from || Buffer;
    module2.exports = function parseBytea(input) {
      if (/^\\x/.test(input)) {
        return bufferFrom(input.substr(2), "hex");
      }
      var output = "";
      var i = 0;
      while (i < input.length) {
        if (input[i] !== "\\") {
          output += input[i];
          ++i;
        } else {
          if (/[0-7]{3}/.test(input.substr(i + 1, 3))) {
            output += String.fromCharCode(parseInt(input.substr(i + 1, 3), 8));
            i += 4;
          } else {
            var backslashes = 1;
            while (i + backslashes < input.length && input[i + backslashes] === "\\") {
              backslashes++;
            }
            for (var k = 0; k < Math.floor(backslashes / 2); ++k) {
              output += "\\";
            }
            i += Math.floor(backslashes / 2) * 2;
          }
        }
      }
      return bufferFrom(output, "binary");
    };
  }
});

// node_modules/pg-types/lib/textParsers.js
var require_textParsers = __commonJS({
  "node_modules/pg-types/lib/textParsers.js"(exports2, module2) {
    var array = require_postgres_array();
    var arrayParser = require_arrayParser();
    var parseDate = require_postgres_date();
    var parseInterval = require_postgres_interval();
    var parseByteA = require_postgres_bytea();
    function allowNull(fn) {
      return function nullAllowed(value) {
        if (value === null) return value;
        return fn(value);
      };
    }
    function parseBool(value) {
      if (value === null) return value;
      return value === "TRUE" || value === "t" || value === "true" || value === "y" || value === "yes" || value === "on" || value === "1";
    }
    function parseBoolArray(value) {
      if (!value) return null;
      return array.parse(value, parseBool);
    }
    function parseBaseTenInt(string) {
      return parseInt(string, 10);
    }
    function parseIntegerArray(value) {
      if (!value) return null;
      return array.parse(value, allowNull(parseBaseTenInt));
    }
    function parseBigIntegerArray(value) {
      if (!value) return null;
      return array.parse(value, allowNull(function(entry) {
        return parseBigInteger(entry).trim();
      }));
    }
    var parsePointArray = function(value) {
      if (!value) {
        return null;
      }
      var p = arrayParser.create(value, function(entry) {
        if (entry !== null) {
          entry = parsePoint(entry);
        }
        return entry;
      });
      return p.parse();
    };
    var parseFloatArray = function(value) {
      if (!value) {
        return null;
      }
      var p = arrayParser.create(value, function(entry) {
        if (entry !== null) {
          entry = parseFloat(entry);
        }
        return entry;
      });
      return p.parse();
    };
    var parseStringArray = function(value) {
      if (!value) {
        return null;
      }
      var p = arrayParser.create(value);
      return p.parse();
    };
    var parseDateArray = function(value) {
      if (!value) {
        return null;
      }
      var p = arrayParser.create(value, function(entry) {
        if (entry !== null) {
          entry = parseDate(entry);
        }
        return entry;
      });
      return p.parse();
    };
    var parseIntervalArray = function(value) {
      if (!value) {
        return null;
      }
      var p = arrayParser.create(value, function(entry) {
        if (entry !== null) {
          entry = parseInterval(entry);
        }
        return entry;
      });
      return p.parse();
    };
    var parseByteAArray = function(value) {
      if (!value) {
        return null;
      }
      return array.parse(value, allowNull(parseByteA));
    };
    var parseInteger = function(value) {
      return parseInt(value, 10);
    };
    var parseBigInteger = function(value) {
      var valStr = String(value);
      if (/^\d+$/.test(valStr)) {
        return valStr;
      }
      return value;
    };
    var parseJsonArray = function(value) {
      if (!value) {
        return null;
      }
      return array.parse(value, allowNull(JSON.parse));
    };
    var parsePoint = function(value) {
      if (value[0] !== "(") {
        return null;
      }
      value = value.substring(1, value.length - 1).split(",");
      return {
        x: parseFloat(value[0]),
        y: parseFloat(value[1])
      };
    };
    var parseCircle = function(value) {
      if (value[0] !== "<" && value[1] !== "(") {
        return null;
      }
      var point = "(";
      var radius = "";
      var pointParsed = false;
      for (var i = 2; i < value.length - 1; i++) {
        if (!pointParsed) {
          point += value[i];
        }
        if (value[i] === ")") {
          pointParsed = true;
          continue;
        } else if (!pointParsed) {
          continue;
        }
        if (value[i] === ",") {
          continue;
        }
        radius += value[i];
      }
      var result = parsePoint(point);
      result.radius = parseFloat(radius);
      return result;
    };
    var init = function(register) {
      register(20, parseBigInteger);
      register(21, parseInteger);
      register(23, parseInteger);
      register(26, parseInteger);
      register(700, parseFloat);
      register(701, parseFloat);
      register(16, parseBool);
      register(1082, parseDate);
      register(1114, parseDate);
      register(1184, parseDate);
      register(600, parsePoint);
      register(651, parseStringArray);
      register(718, parseCircle);
      register(1e3, parseBoolArray);
      register(1001, parseByteAArray);
      register(1005, parseIntegerArray);
      register(1007, parseIntegerArray);
      register(1028, parseIntegerArray);
      register(1016, parseBigIntegerArray);
      register(1017, parsePointArray);
      register(1021, parseFloatArray);
      register(1022, parseFloatArray);
      register(1231, parseFloatArray);
      register(1014, parseStringArray);
      register(1015, parseStringArray);
      register(1008, parseStringArray);
      register(1009, parseStringArray);
      register(1040, parseStringArray);
      register(1041, parseStringArray);
      register(1115, parseDateArray);
      register(1182, parseDateArray);
      register(1185, parseDateArray);
      register(1186, parseInterval);
      register(1187, parseIntervalArray);
      register(17, parseByteA);
      register(114, JSON.parse.bind(JSON));
      register(3802, JSON.parse.bind(JSON));
      register(199, parseJsonArray);
      register(3807, parseJsonArray);
      register(3907, parseStringArray);
      register(2951, parseStringArray);
      register(791, parseStringArray);
      register(1183, parseStringArray);
      register(1270, parseStringArray);
    };
    module2.exports = {
      init
    };
  }
});

// node_modules/pg-int8/index.js
var require_pg_int8 = __commonJS({
  "node_modules/pg-int8/index.js"(exports2, module2) {
    "use strict";
    var BASE = 1e6;
    function readInt8(buffer) {
      var high = buffer.readInt32BE(0);
      var low = buffer.readUInt32BE(4);
      var sign3 = "";
      if (high < 0) {
        high = ~high + (low === 0);
        low = ~low + 1 >>> 0;
        sign3 = "-";
      }
      var result = "";
      var carry;
      var t;
      var digits;
      var pad3;
      var l;
      var i;
      {
        carry = high % BASE;
        high = high / BASE >>> 0;
        t = 4294967296 * carry + low;
        low = t / BASE >>> 0;
        digits = "" + (t - BASE * low);
        if (low === 0 && high === 0) {
          return sign3 + digits + result;
        }
        pad3 = "";
        l = 6 - digits.length;
        for (i = 0; i < l; i++) {
          pad3 += "0";
        }
        result = pad3 + digits + result;
      }
      {
        carry = high % BASE;
        high = high / BASE >>> 0;
        t = 4294967296 * carry + low;
        low = t / BASE >>> 0;
        digits = "" + (t - BASE * low);
        if (low === 0 && high === 0) {
          return sign3 + digits + result;
        }
        pad3 = "";
        l = 6 - digits.length;
        for (i = 0; i < l; i++) {
          pad3 += "0";
        }
        result = pad3 + digits + result;
      }
      {
        carry = high % BASE;
        high = high / BASE >>> 0;
        t = 4294967296 * carry + low;
        low = t / BASE >>> 0;
        digits = "" + (t - BASE * low);
        if (low === 0 && high === 0) {
          return sign3 + digits + result;
        }
        pad3 = "";
        l = 6 - digits.length;
        for (i = 0; i < l; i++) {
          pad3 += "0";
        }
        result = pad3 + digits + result;
      }
      {
        carry = high % BASE;
        t = 4294967296 * carry + low;
        digits = "" + t % BASE;
        return sign3 + digits + result;
      }
    }
    module2.exports = readInt8;
  }
});

// node_modules/pg-types/lib/binaryParsers.js
var require_binaryParsers = __commonJS({
  "node_modules/pg-types/lib/binaryParsers.js"(exports2, module2) {
    var parseInt64 = require_pg_int8();
    var parseBits = function(data, bits, offset, invert, callback) {
      offset = offset || 0;
      invert = invert || false;
      callback = callback || function(lastValue, newValue, bits2) {
        return lastValue * Math.pow(2, bits2) + newValue;
      };
      var offsetBytes = offset >> 3;
      var inv = function(value) {
        if (invert) {
          return ~value & 255;
        }
        return value;
      };
      var mask = 255;
      var firstBits = 8 - offset % 8;
      if (bits < firstBits) {
        mask = 255 << 8 - bits & 255;
        firstBits = bits;
      }
      if (offset) {
        mask = mask >> offset % 8;
      }
      var result = 0;
      if (offset % 8 + bits >= 8) {
        result = callback(0, inv(data[offsetBytes]) & mask, firstBits);
      }
      var bytes = bits + offset >> 3;
      for (var i = offsetBytes + 1; i < bytes; i++) {
        result = callback(result, inv(data[i]), 8);
      }
      var lastBits = (bits + offset) % 8;
      if (lastBits > 0) {
        result = callback(result, inv(data[bytes]) >> 8 - lastBits, lastBits);
      }
      return result;
    };
    var parseFloatFromBits = function(data, precisionBits, exponentBits) {
      var bias = Math.pow(2, exponentBits - 1) - 1;
      var sign3 = parseBits(data, 1);
      var exponent = parseBits(data, exponentBits, 1);
      if (exponent === 0) {
        return 0;
      }
      var precisionBitsCounter = 1;
      var parsePrecisionBits = function(lastValue, newValue, bits) {
        if (lastValue === 0) {
          lastValue = 1;
        }
        for (var i = 1; i <= bits; i++) {
          precisionBitsCounter /= 2;
          if ((newValue & 1 << bits - i) > 0) {
            lastValue += precisionBitsCounter;
          }
        }
        return lastValue;
      };
      var mantissa = parseBits(data, precisionBits, exponentBits + 1, false, parsePrecisionBits);
      if (exponent == Math.pow(2, exponentBits + 1) - 1) {
        if (mantissa === 0) {
          return sign3 === 0 ? Infinity : -Infinity;
        }
        return NaN;
      }
      return (sign3 === 0 ? 1 : -1) * Math.pow(2, exponent - bias) * mantissa;
    };
    var parseInt16 = function(value) {
      if (parseBits(value, 1) == 1) {
        return -1 * (parseBits(value, 15, 1, true) + 1);
      }
      return parseBits(value, 15, 1);
    };
    var parseInt32 = function(value) {
      if (parseBits(value, 1) == 1) {
        return -1 * (parseBits(value, 31, 1, true) + 1);
      }
      return parseBits(value, 31, 1);
    };
    var parseFloat32 = function(value) {
      return parseFloatFromBits(value, 23, 8);
    };
    var parseFloat64 = function(value) {
      return parseFloatFromBits(value, 52, 11);
    };
    var parseNumeric = function(value) {
      var sign3 = parseBits(value, 16, 32);
      if (sign3 == 49152) {
        return NaN;
      }
      var weight = Math.pow(1e4, parseBits(value, 16, 16));
      var result = 0;
      var digits = [];
      var ndigits = parseBits(value, 16);
      for (var i = 0; i < ndigits; i++) {
        result += parseBits(value, 16, 64 + 16 * i) * weight;
        weight /= 1e4;
      }
      var scale = Math.pow(10, parseBits(value, 16, 48));
      return (sign3 === 0 ? 1 : -1) * Math.round(result * scale) / scale;
    };
    var parseDate = function(isUTC, value) {
      var sign3 = parseBits(value, 1);
      var rawValue = parseBits(value, 63, 1);
      var result = new Date((sign3 === 0 ? 1 : -1) * rawValue / 1e3 + 9466848e5);
      if (!isUTC) {
        result.setTime(result.getTime() + result.getTimezoneOffset() * 6e4);
      }
      result.usec = rawValue % 1e3;
      result.getMicroSeconds = function() {
        return this.usec;
      };
      result.setMicroSeconds = function(value2) {
        this.usec = value2;
      };
      result.getUTCMicroSeconds = function() {
        return this.usec;
      };
      return result;
    };
    var parseArray = function(value) {
      var dim = parseBits(value, 32);
      var flags = parseBits(value, 32, 32);
      var elementType = parseBits(value, 32, 64);
      var offset = 96;
      var dims = [];
      for (var i = 0; i < dim; i++) {
        dims[i] = parseBits(value, 32, offset);
        offset += 32;
        offset += 32;
      }
      var parseElement = function(elementType2) {
        var length = parseBits(value, 32, offset);
        offset += 32;
        if (length == 4294967295) {
          return null;
        }
        var result;
        if (elementType2 == 23 || elementType2 == 20) {
          result = parseBits(value, length * 8, offset);
          offset += length * 8;
          return result;
        } else if (elementType2 == 25) {
          result = value.toString(this.encoding, offset >> 3, (offset += length << 3) >> 3);
          return result;
        } else {
          console.log("ERROR: ElementType not implemented: " + elementType2);
        }
      };
      var parse2 = function(dimension, elementType2) {
        var array = [];
        var i2;
        if (dimension.length > 1) {
          var count = dimension.shift();
          for (i2 = 0; i2 < count; i2++) {
            array[i2] = parse2(dimension, elementType2);
          }
          dimension.unshift(count);
        } else {
          for (i2 = 0; i2 < dimension[0]; i2++) {
            array[i2] = parseElement(elementType2);
          }
        }
        return array;
      };
      return parse2(dims, elementType);
    };
    var parseText = function(value) {
      return value.toString("utf8");
    };
    var parseBool = function(value) {
      if (value === null) return null;
      return parseBits(value, 8) > 0;
    };
    var init = function(register) {
      register(20, parseInt64);
      register(21, parseInt16);
      register(23, parseInt32);
      register(26, parseInt32);
      register(1700, parseNumeric);
      register(700, parseFloat32);
      register(701, parseFloat64);
      register(16, parseBool);
      register(1114, parseDate.bind(null, false));
      register(1184, parseDate.bind(null, true));
      register(1e3, parseArray);
      register(1007, parseArray);
      register(1016, parseArray);
      register(1008, parseArray);
      register(1009, parseArray);
      register(25, parseText);
    };
    module2.exports = {
      init
    };
  }
});

// node_modules/pg-types/lib/builtins.js
var require_builtins = __commonJS({
  "node_modules/pg-types/lib/builtins.js"(exports2, module2) {
    module2.exports = {
      BOOL: 16,
      BYTEA: 17,
      CHAR: 18,
      INT8: 20,
      INT2: 21,
      INT4: 23,
      REGPROC: 24,
      TEXT: 25,
      OID: 26,
      TID: 27,
      XID: 28,
      CID: 29,
      JSON: 114,
      XML: 142,
      PG_NODE_TREE: 194,
      SMGR: 210,
      PATH: 602,
      POLYGON: 604,
      CIDR: 650,
      FLOAT4: 700,
      FLOAT8: 701,
      ABSTIME: 702,
      RELTIME: 703,
      TINTERVAL: 704,
      CIRCLE: 718,
      MACADDR8: 774,
      MONEY: 790,
      MACADDR: 829,
      INET: 869,
      ACLITEM: 1033,
      BPCHAR: 1042,
      VARCHAR: 1043,
      DATE: 1082,
      TIME: 1083,
      TIMESTAMP: 1114,
      TIMESTAMPTZ: 1184,
      INTERVAL: 1186,
      TIMETZ: 1266,
      BIT: 1560,
      VARBIT: 1562,
      NUMERIC: 1700,
      REFCURSOR: 1790,
      REGPROCEDURE: 2202,
      REGOPER: 2203,
      REGOPERATOR: 2204,
      REGCLASS: 2205,
      REGTYPE: 2206,
      UUID: 2950,
      TXID_SNAPSHOT: 2970,
      PG_LSN: 3220,
      PG_NDISTINCT: 3361,
      PG_DEPENDENCIES: 3402,
      TSVECTOR: 3614,
      TSQUERY: 3615,
      GTSVECTOR: 3642,
      REGCONFIG: 3734,
      REGDICTIONARY: 3769,
      JSONB: 3802,
      REGNAMESPACE: 4089,
      REGROLE: 4096
    };
  }
});

// node_modules/pg-types/index.js
var require_pg_types = __commonJS({
  "node_modules/pg-types/index.js"(exports2) {
    var textParsers = require_textParsers();
    var binaryParsers = require_binaryParsers();
    var arrayParser = require_arrayParser();
    var builtinTypes = require_builtins();
    exports2.getTypeParser = getTypeParser;
    exports2.setTypeParser = setTypeParser;
    exports2.arrayParser = arrayParser;
    exports2.builtins = builtinTypes;
    var typeParsers = {
      text: {},
      binary: {}
    };
    function noParse(val) {
      return String(val);
    }
    function getTypeParser(oid, format) {
      format = format || "text";
      if (!typeParsers[format]) {
        return noParse;
      }
      return typeParsers[format][oid] || noParse;
    }
    function setTypeParser(oid, format, parseFn) {
      if (typeof format == "function") {
        parseFn = format;
        format = "text";
      }
      typeParsers[format][oid] = parseFn;
    }
    textParsers.init(function(oid, converter) {
      typeParsers.text[oid] = converter;
    });
    binaryParsers.init(function(oid, converter) {
      typeParsers.binary[oid] = converter;
    });
  }
});

// node_modules/pg/lib/defaults.js
var require_defaults = __commonJS({
  "node_modules/pg/lib/defaults.js"(exports2, module2) {
    "use strict";
    var user;
    try {
      user = process.platform === "win32" ? process.env.USERNAME : process.env.USER;
    } catch {
    }
    module2.exports = {
      // database host. defaults to localhost
      host: "localhost",
      // database user's name
      user,
      // name of database to connect
      database: void 0,
      // database user's password
      password: null,
      // a Postgres connection string to be used instead of setting individual connection items
      // NOTE:  Setting this value will cause it to override any other value (such as database or user) defined
      // in the defaults object.
      connectionString: void 0,
      // database port
      port: 5432,
      // number of rows to return at a time from a prepared statement's
      // portal. 0 will return all rows at once
      rows: 0,
      // binary result mode
      binary: false,
      // Connection pool options - see https://github.com/brianc/node-pg-pool
      // number of connections to use in connection pool
      // 0 will disable connection pooling
      max: 10,
      // max milliseconds a client can go unused before it is removed
      // from the pool and destroyed
      idleTimeoutMillis: 3e4,
      client_encoding: "",
      ssl: false,
      // SSL negotiation style: 'postgres' (traditional SSLRequest) or 'direct'
      sslnegotiation: void 0,
      application_name: void 0,
      fallback_application_name: void 0,
      options: void 0,
      parseInputDatesAsUTC: false,
      // max milliseconds any query using this connection will execute for before timing out in error.
      // false=unlimited
      statement_timeout: false,
      // Abort any statement that waits longer than the specified duration in milliseconds while attempting to acquire a lock.
      // false=unlimited
      lock_timeout: false,
      // Terminate any session with an open transaction that has been idle for longer than the specified duration in milliseconds
      // false=unlimited
      idle_in_transaction_session_timeout: false,
      // max milliseconds to wait for query to complete (client side)
      query_timeout: false,
      connect_timeout: 0,
      keepalives: 1,
      keepalives_idle: 0
    };
    var pgTypes = require_pg_types();
    var parseBigInteger = pgTypes.getTypeParser(20, "text");
    var parseBigIntegerArray = pgTypes.getTypeParser(1016, "text");
    module2.exports.__defineSetter__("parseInt8", function(val) {
      pgTypes.setTypeParser(20, "text", val ? pgTypes.getTypeParser(23, "text") : parseBigInteger);
      pgTypes.setTypeParser(1016, "text", val ? pgTypes.getTypeParser(1007, "text") : parseBigIntegerArray);
    });
  }
});

// node_modules/pg/lib/utils.js
var require_utils = __commonJS({
  "node_modules/pg/lib/utils.js"(exports2, module2) {
    "use strict";
    var defaults2 = require_defaults();
    var { isDate } = require("util/types");
    function escapeElement(elementRepresentation) {
      const escaped = elementRepresentation.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      return '"' + escaped + '"';
    }
    function arrayString(val) {
      let result = "{";
      for (let i = 0; i < val.length; i++) {
        if (i > 0) {
          result += ",";
        }
        let item = val[i];
        if (item == null) {
          result += "NULL";
        } else if (Array.isArray(item)) {
          result += arrayString(item);
        } else if (ArrayBuffer.isView(item)) {
          if (!(item instanceof Buffer)) {
            item = Buffer.from(item.buffer, item.byteOffset, item.byteLength);
          }
          result += "\\\\x" + item.toString("hex");
        } else {
          result += escapeElement(prepareValue(item));
        }
      }
      result += "}";
      return result;
    }
    var prepareValue = function(val, seen) {
      if (val == null) {
        return null;
      }
      if (typeof val === "object") {
        if (val instanceof Buffer) {
          return val;
        }
        if (ArrayBuffer.isView(val)) {
          return Buffer.from(val.buffer, val.byteOffset, val.byteLength);
        }
        if (isDate(val)) {
          if (defaults2.parseInputDatesAsUTC) {
            return dateToStringUTC(val);
          } else {
            return dateToString(val);
          }
        }
        if (Array.isArray(val)) {
          return arrayString(val);
        }
        return prepareObject(val, seen);
      }
      return val.toString();
    };
    function prepareObject(val, seen) {
      if (val && typeof val.toPostgres === "function") {
        seen = seen || [];
        if (seen.indexOf(val) !== -1) {
          throw new Error('circular reference detected while preparing "' + val + '" for query');
        }
        seen.push(val);
        return prepareValue(val.toPostgres(prepareValue), seen);
      }
      return JSON.stringify(val);
    }
    function dateToString(date) {
      let offset = -date.getTimezoneOffset();
      let year2 = date.getFullYear();
      const isBCYear = year2 < 1;
      if (isBCYear) year2 = Math.abs(year2) + 1;
      let ret = String(year2).padStart(4, "0") + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0") + "T" + String(date.getHours()).padStart(2, "0") + ":" + String(date.getMinutes()).padStart(2, "0") + ":" + String(date.getSeconds()).padStart(2, "0") + "." + String(date.getMilliseconds()).padStart(3, "0");
      if (offset < 0) {
        ret += "-";
        offset *= -1;
      } else {
        ret += "+";
      }
      ret += String(Math.floor(offset / 60)).padStart(2, "0") + ":" + String(offset % 60).padStart(2, "0");
      if (isBCYear) ret += " BC";
      return ret;
    }
    function dateToStringUTC(date) {
      let year2 = date.getUTCFullYear();
      const isBCYear = year2 < 1;
      if (isBCYear) year2 = Math.abs(year2) + 1;
      let ret = String(year2).padStart(4, "0") + "-" + String(date.getUTCMonth() + 1).padStart(2, "0") + "-" + String(date.getUTCDate()).padStart(2, "0") + "T" + String(date.getUTCHours()).padStart(2, "0") + ":" + String(date.getUTCMinutes()).padStart(2, "0") + ":" + String(date.getUTCSeconds()).padStart(2, "0") + "." + String(date.getUTCMilliseconds()).padStart(3, "0");
      ret += "+00:00";
      if (isBCYear) ret += " BC";
      return ret;
    }
    function normalizeQueryConfig(config, values, callback) {
      config = typeof config === "string" ? { text: config } : config;
      if (values) {
        if (typeof values === "function") {
          config.callback = values;
        } else {
          config.values = values;
        }
      }
      if (callback) {
        config.callback = callback;
      }
      return config;
    }
    var escapeIdentifier2 = function(str) {
      return '"' + str.replace(/"/g, '""') + '"';
    };
    var escapeLiteral2 = function(str) {
      let hasBackslash = false;
      let escaped = "'";
      if (str == null) {
        return "''";
      }
      if (typeof str !== "string") {
        return "''";
      }
      for (let i = 0; i < str.length; i++) {
        const c = str[i];
        if (c === "'") {
          escaped += c + c;
        } else if (c === "\\") {
          escaped += c + c;
          hasBackslash = true;
        } else {
          escaped += c;
        }
      }
      escaped += "'";
      if (hasBackslash === true) {
        escaped = " E" + escaped;
      }
      return escaped;
    };
    module2.exports = {
      prepareValue: function prepareValueWrapper(value) {
        return prepareValue(value);
      },
      normalizeQueryConfig,
      escapeIdentifier: escapeIdentifier2,
      escapeLiteral: escapeLiteral2
    };
  }
});

// node_modules/pg/lib/crypto/utils.js
var require_utils2 = __commonJS({
  "node_modules/pg/lib/crypto/utils.js"(exports2, module2) {
    var nodeCrypto = require("crypto");
    module2.exports = {
      postgresMd5PasswordHash,
      randomBytes,
      deriveKey,
      sha256,
      hashByName,
      hmacSha256,
      md5
    };
    var webCrypto = nodeCrypto.webcrypto || globalThis.crypto;
    var subtleCrypto = webCrypto.subtle;
    var textEncoder = new TextEncoder();
    function randomBytes(length) {
      return webCrypto.getRandomValues(Buffer.alloc(length));
    }
    async function md5(string) {
      try {
        return nodeCrypto.createHash("md5").update(string, "utf-8").digest("hex");
      } catch (e) {
        const data = typeof string === "string" ? textEncoder.encode(string) : string;
        const hash = await subtleCrypto.digest("MD5", data);
        return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
      }
    }
    async function postgresMd5PasswordHash(user, password, salt) {
      const inner = await md5(password + user);
      const outer = await md5(Buffer.concat([Buffer.from(inner), salt]));
      return "md5" + outer;
    }
    async function sha256(text) {
      return await subtleCrypto.digest("SHA-256", text);
    }
    async function hashByName(hashName, text) {
      return await subtleCrypto.digest(hashName, text);
    }
    async function hmacSha256(keyBuffer, msg) {
      const key = await subtleCrypto.importKey("raw", keyBuffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      return await subtleCrypto.sign("HMAC", key, textEncoder.encode(msg));
    }
    async function deriveKey(password, salt, iterations) {
      const key = await subtleCrypto.importKey("raw", textEncoder.encode(password), "PBKDF2", false, ["deriveBits"]);
      const params = { name: "PBKDF2", hash: "SHA-256", salt, iterations };
      return await subtleCrypto.deriveBits(params, key, 32 * 8, ["deriveBits"]);
    }
  }
});

// node_modules/pg/lib/crypto/cert-signatures.js
var require_cert_signatures = __commonJS({
  "node_modules/pg/lib/crypto/cert-signatures.js"(exports2, module2) {
    function x509Error(msg, cert) {
      return new Error("SASL channel binding: " + msg + " when parsing public certificate " + cert.toString("base64"));
    }
    function readASN1Length(data, index) {
      let length = data[index++];
      if (length < 128) return { length, index };
      const lengthBytes = length & 127;
      if (lengthBytes > 4) throw x509Error("bad length", data);
      length = 0;
      for (let i = 0; i < lengthBytes; i++) {
        length = length << 8 | data[index++];
      }
      return { length, index };
    }
    function readASN1OID(data, index) {
      if (data[index++] !== 6) throw x509Error("non-OID data", data);
      const { length: OIDLength, index: indexAfterOIDLength } = readASN1Length(data, index);
      index = indexAfterOIDLength;
      const lastIndex = index + OIDLength;
      const byte1 = data[index++];
      let oid = (byte1 / 40 >> 0) + "." + byte1 % 40;
      while (index < lastIndex) {
        let value = 0;
        while (index < lastIndex) {
          const nextByte = data[index++];
          value = value << 7 | nextByte & 127;
          if (nextByte < 128) break;
        }
        oid += "." + value;
      }
      return { oid, index };
    }
    function expectASN1Seq(data, index) {
      if (data[index++] !== 48) throw x509Error("non-sequence data", data);
      return readASN1Length(data, index);
    }
    function signatureAlgorithmHashFromCertificate(data, index) {
      if (index === void 0) index = 0;
      index = expectASN1Seq(data, index).index;
      const { length: certInfoLength, index: indexAfterCertInfoLength } = expectASN1Seq(data, index);
      index = indexAfterCertInfoLength + certInfoLength;
      index = expectASN1Seq(data, index).index;
      const { oid, index: indexAfterOID } = readASN1OID(data, index);
      switch (oid) {
        case "1.2.840.113549.1.1.4":
          return "MD5";
        case "1.2.840.113549.1.1.5":
          return "SHA-1";
        case "1.2.840.113549.1.1.11":
          return "SHA-256";
        case "1.2.840.113549.1.1.12":
          return "SHA-384";
        case "1.2.840.113549.1.1.13":
          return "SHA-512";
        case "1.2.840.113549.1.1.14":
          return "SHA-224";
        case "1.2.840.113549.1.1.15":
          return "SHA512-224";
        case "1.2.840.113549.1.1.16":
          return "SHA512-256";
        case "1.2.840.10045.4.1":
          return "SHA-1";
        case "1.2.840.10045.4.3.1":
          return "SHA-224";
        case "1.2.840.10045.4.3.2":
          return "SHA-256";
        case "1.2.840.10045.4.3.3":
          return "SHA-384";
        case "1.2.840.10045.4.3.4":
          return "SHA-512";
        case "1.2.840.113549.1.1.10": {
          index = indexAfterOID;
          index = expectASN1Seq(data, index).index;
          if (data[index++] !== 160) throw x509Error("non-tag data", data);
          index = readASN1Length(data, index).index;
          index = expectASN1Seq(data, index).index;
          const { oid: hashOID } = readASN1OID(data, index);
          switch (hashOID) {
            case "1.2.840.113549.2.5":
              return "MD5";
            case "1.3.14.3.2.26":
              return "SHA-1";
            case "2.16.840.1.101.3.4.2.1":
              return "SHA-256";
            case "2.16.840.1.101.3.4.2.2":
              return "SHA-384";
            case "2.16.840.1.101.3.4.2.3":
              return "SHA-512";
          }
          throw x509Error("unknown hash OID " + hashOID, data);
        }
        case "1.3.101.110":
        case "1.3.101.112":
          return "SHA-512";
        case "1.3.101.111":
        case "1.3.101.113":
          throw x509Error("Ed448 certificate channel binding is not currently supported by Postgres");
      }
      throw x509Error("unknown OID " + oid, data);
    }
    module2.exports = { signatureAlgorithmHashFromCertificate };
  }
});

// node_modules/pg/lib/crypto/sasl.js
var require_sasl = __commonJS({
  "node_modules/pg/lib/crypto/sasl.js"(exports2, module2) {
    "use strict";
    var crypto4 = require_utils2();
    var { signatureAlgorithmHashFromCertificate } = require_cert_signatures();
    function saslprep(password) {
      const nonAsciiSpace = /[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000]/g;
      const mappedToNothing = /[\u00AD\u034F\u1806\u180B\u180C\u180D\u200C\u200D\u2060\uFE00-\uFE0F\uFEFF]/g;
      return password.replace(nonAsciiSpace, " ").replace(mappedToNothing, "").normalize("NFKC");
    }
    var DEFAULT_MAX_SCRAM_ITERATIONS = 1e5;
    function startSession(mechanisms, stream, scramMaxIterations = DEFAULT_MAX_SCRAM_ITERATIONS) {
      const candidates = ["SCRAM-SHA-256"];
      if (stream) candidates.unshift("SCRAM-SHA-256-PLUS");
      const mechanism = candidates.find((candidate) => mechanisms.includes(candidate));
      if (!mechanism) {
        throw new Error("SASL: Only mechanism(s) " + candidates.join(" and ") + " are supported");
      }
      if (mechanism === "SCRAM-SHA-256-PLUS" && typeof stream.getPeerCertificate !== "function") {
        throw new Error("SASL: Mechanism SCRAM-SHA-256-PLUS requires a certificate");
      }
      const clientNonce = crypto4.randomBytes(18).toString("base64");
      const gs2Header = mechanism === "SCRAM-SHA-256-PLUS" ? "p=tls-server-end-point" : stream ? "y" : "n";
      return {
        mechanism,
        clientNonce,
        response: gs2Header + ",,n=*,r=" + clientNonce,
        message: "SASLInitialResponse",
        scramMaxIterations
      };
    }
    async function continueSession(session, password, serverData, stream) {
      if (session.message !== "SASLInitialResponse") {
        throw new Error("SASL: Last message was not SASLInitialResponse");
      }
      if (typeof password !== "string") {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string");
      }
      if (password === "") {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a non-empty string");
      }
      if (typeof serverData !== "string") {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: serverData must be a string");
      }
      const sv = parseServerFirstMessage(serverData);
      if (!sv.nonce.startsWith(session.clientNonce)) {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: server nonce does not start with client nonce");
      } else if (sv.nonce.length === session.clientNonce.length) {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: server nonce is too short");
      }
      const scramMaxIterations = typeof session.scramMaxIterations === "number" ? session.scramMaxIterations : DEFAULT_MAX_SCRAM_ITERATIONS;
      if (scramMaxIterations !== 0 && sv.iteration > scramMaxIterations) {
        throw new Error(
          "SASL: SCRAM-SERVER-FIRST-MESSAGE: iteration count " + sv.iteration + " exceeds scramMaxIterations of " + scramMaxIterations
        );
      }
      const clientFirstMessageBare = "n=*,r=" + session.clientNonce;
      const serverFirstMessage = "r=" + sv.nonce + ",s=" + sv.salt + ",i=" + sv.iteration;
      let channelBinding = stream ? "eSws" : "biws";
      if (session.mechanism === "SCRAM-SHA-256-PLUS") {
        const peerCert = stream.getPeerCertificate().raw;
        let hashName = signatureAlgorithmHashFromCertificate(peerCert);
        if (hashName === "MD5" || hashName === "SHA-1") hashName = "SHA-256";
        const certHash = await crypto4.hashByName(hashName, peerCert);
        const bindingData = Buffer.concat([Buffer.from("p=tls-server-end-point,,"), Buffer.from(certHash)]);
        channelBinding = bindingData.toString("base64");
      }
      const clientFinalMessageWithoutProof = "c=" + channelBinding + ",r=" + sv.nonce;
      const authMessage = clientFirstMessageBare + "," + serverFirstMessage + "," + clientFinalMessageWithoutProof;
      const saltBytes = Buffer.from(sv.salt, "base64");
      const saltedPassword = await crypto4.deriveKey(saslprep(password), saltBytes, sv.iteration);
      const clientKey = await crypto4.hmacSha256(saltedPassword, "Client Key");
      const storedKey = await crypto4.sha256(clientKey);
      const clientSignature = await crypto4.hmacSha256(storedKey, authMessage);
      const clientProof = xorBuffers(Buffer.from(clientKey), Buffer.from(clientSignature)).toString("base64");
      const serverKey = await crypto4.hmacSha256(saltedPassword, "Server Key");
      const serverSignatureBytes = await crypto4.hmacSha256(serverKey, authMessage);
      session.message = "SASLResponse";
      session.serverSignature = Buffer.from(serverSignatureBytes).toString("base64");
      session.response = clientFinalMessageWithoutProof + ",p=" + clientProof;
    }
    function finalizeSession(session, serverData) {
      if (session.message !== "SASLResponse") {
        throw new Error("SASL: Last message was not SASLResponse");
      }
      if (typeof serverData !== "string") {
        throw new Error("SASL: SCRAM-SERVER-FINAL-MESSAGE: serverData must be a string");
      }
      const { serverSignature } = parseServerFinalMessage(serverData);
      if (serverSignature !== session.serverSignature) {
        throw new Error("SASL: SCRAM-SERVER-FINAL-MESSAGE: server signature does not match");
      }
    }
    function isPrintableChars(text) {
      if (typeof text !== "string") {
        throw new TypeError("SASL: text must be a string");
      }
      return text.split("").map((_, i) => text.charCodeAt(i)).every((c) => c >= 33 && c <= 43 || c >= 45 && c <= 126);
    }
    function isBase64(text) {
      return /^(?:[a-zA-Z0-9+/]{4})*(?:[a-zA-Z0-9+/]{2}==|[a-zA-Z0-9+/]{3}=)?$/.test(text);
    }
    function parseAttributePairs(text) {
      if (typeof text !== "string") {
        throw new TypeError("SASL: attribute pairs text must be a string");
      }
      return new Map(
        text.split(",").map((attrValue) => {
          if (!/^.=/.test(attrValue)) {
            throw new Error("SASL: Invalid attribute pair entry");
          }
          const name = attrValue[0];
          const value = attrValue.substring(2);
          return [name, value];
        })
      );
    }
    function parseServerFirstMessage(data) {
      const attrPairs = parseAttributePairs(data);
      const nonce = attrPairs.get("r");
      if (!nonce) {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: nonce missing");
      } else if (!isPrintableChars(nonce)) {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: nonce must only contain printable characters");
      }
      const salt = attrPairs.get("s");
      if (!salt) {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: salt missing");
      } else if (!isBase64(salt)) {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: salt must be base64");
      }
      const iterationText = attrPairs.get("i");
      if (!iterationText) {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: iteration missing");
      } else if (!/^[1-9][0-9]*$/.test(iterationText)) {
        throw new Error("SASL: SCRAM-SERVER-FIRST-MESSAGE: invalid iteration count");
      }
      const iteration = parseInt(iterationText, 10);
      return {
        nonce,
        salt,
        iteration
      };
    }
    function parseServerFinalMessage(serverData) {
      const attrPairs = parseAttributePairs(serverData);
      const error = attrPairs.get("e");
      const serverSignature = attrPairs.get("v");
      if (error) {
        throw new Error(`SASL: SCRAM-SERVER-FINAL-MESSAGE: server returned error: "${error}"`);
      }
      if (!serverSignature) {
        throw new Error("SASL: SCRAM-SERVER-FINAL-MESSAGE: server signature is missing");
      } else if (!isBase64(serverSignature)) {
        throw new Error("SASL: SCRAM-SERVER-FINAL-MESSAGE: server signature must be base64");
      }
      return {
        serverSignature
      };
    }
    function xorBuffers(a, b) {
      if (!Buffer.isBuffer(a)) {
        throw new TypeError("first argument must be a Buffer");
      }
      if (!Buffer.isBuffer(b)) {
        throw new TypeError("second argument must be a Buffer");
      }
      if (a.length !== b.length) {
        throw new Error("Buffer lengths must match");
      }
      if (a.length === 0) {
        throw new Error("Buffers cannot be empty");
      }
      return Buffer.from(a.map((_, i) => a[i] ^ b[i]));
    }
    module2.exports = {
      startSession,
      continueSession,
      finalizeSession,
      DEFAULT_MAX_SCRAM_ITERATIONS
    };
  }
});

// node_modules/pg/lib/type-overrides.js
var require_type_overrides = __commonJS({
  "node_modules/pg/lib/type-overrides.js"(exports2, module2) {
    "use strict";
    var types5 = require_pg_types();
    function TypeOverrides2(userTypes) {
      this._types = userTypes || types5;
      this.text = {};
      this.binary = {};
    }
    TypeOverrides2.prototype.getOverrides = function(format) {
      switch (format) {
        case "text":
          return this.text;
        case "binary":
          return this.binary;
        default:
          return {};
      }
    };
    TypeOverrides2.prototype.setTypeParser = function(oid, format, parseFn) {
      if (typeof format === "function") {
        parseFn = format;
        format = "text";
      }
      this.getOverrides(format)[oid] = parseFn;
    };
    TypeOverrides2.prototype.getTypeParser = function(oid, format) {
      format = format || "text";
      return this.getOverrides(format)[oid] || this._types.getTypeParser(oid, format);
    };
    module2.exports = TypeOverrides2;
  }
});

// node_modules/pg-connection-string/index.js
var require_pg_connection_string = __commonJS({
  "node_modules/pg-connection-string/index.js"(exports2, module2) {
    "use strict";
    function parse2(str, options = {}) {
      if (str.charAt(0) === "/") {
        const config2 = str.split(" ");
        return { host: config2[0], database: config2[1] };
      }
      const config = /* @__PURE__ */ Object.create(null);
      let result;
      let dummyHost = false;
      if (/ |%[^a-f0-9]|%[a-f0-9][^a-f0-9]/i.test(str)) {
        str = encodeURI(str).replace(/%25(\d\d)/g, "%$1");
      }
      try {
        try {
          result = new URL(str, "postgres://base");
        } catch (e) {
          result = new URL(str.replace("@/", "@___DUMMY___/"), "postgres://base");
          dummyHost = true;
        }
      } catch (err) {
        err.input && (err.input = "*****REDACTED*****");
        throw err;
      }
      for (const entry of result.searchParams.entries()) {
        config[entry[0]] = entry[1];
      }
      config.user = config.user || decodeURIComponent(result.username);
      config.password = config.password || decodeURIComponent(result.password);
      if (result.protocol == "socket:") {
        config.host = decodeURI(result.pathname);
        config.database = result.searchParams.get("db");
        config.client_encoding = result.searchParams.get("encoding");
        return config;
      }
      const hostname = dummyHost ? "" : result.hostname;
      if (!config.host) {
        config.host = decodeURIComponent(hostname);
      } else if (hostname && /^%2f/i.test(hostname)) {
        result.pathname = hostname + result.pathname;
      }
      if (!config.port) {
        config.port = result.port;
      }
      const pathname = result.pathname.slice(1) || null;
      config.database = pathname ? decodeURI(pathname) : null;
      if (config.ssl === "true" || config.ssl === "1") {
        config.ssl = true;
      }
      if (config.ssl === "0") {
        config.ssl = false;
      }
      if (config.sslcert || config.sslkey || config.sslrootcert || config.sslmode) {
        config.ssl = {};
      }
      if (config.sslnegotiation === "direct" && config.ssl === void 0) {
        config.ssl = true;
      }
      const fs = config.sslcert || config.sslkey || config.sslrootcert ? require("fs") : null;
      if (config.sslcert) {
        config.ssl.cert = fs.readFileSync(config.sslcert).toString();
      }
      if (config.sslkey) {
        config.ssl.key = fs.readFileSync(config.sslkey).toString();
      }
      if (config.sslrootcert) {
        config.ssl.ca = fs.readFileSync(config.sslrootcert).toString();
      }
      if (options.useLibpqCompat && config.uselibpqcompat) {
        throw new Error("Both useLibpqCompat and uselibpqcompat are set. Please use only one of them.");
      }
      if (config.uselibpqcompat === "true" || options.useLibpqCompat) {
        switch (config.sslmode) {
          case "disable": {
            config.ssl = false;
            break;
          }
          case "prefer": {
            config.ssl.rejectUnauthorized = false;
            break;
          }
          case "require": {
            if (config.sslrootcert) {
              config.ssl.checkServerIdentity = function() {
              };
            } else {
              config.ssl.rejectUnauthorized = false;
            }
            break;
          }
          case "verify-ca": {
            if (!config.ssl.ca) {
              throw new Error(
                "SECURITY WARNING: Using sslmode=verify-ca requires specifying a CA with sslrootcert. If a public CA is used, verify-ca allows connections to a server that somebody else may have registered with the CA, making you vulnerable to Man-in-the-Middle attacks. Either specify a custom CA certificate with sslrootcert parameter or use sslmode=verify-full for proper security."
              );
            }
            config.ssl.checkServerIdentity = function() {
            };
            break;
          }
          case "verify-full": {
            break;
          }
        }
      } else {
        switch (config.sslmode) {
          case "disable": {
            config.ssl = false;
            break;
          }
          case "prefer":
          case "require":
          case "verify-ca":
          case "verify-full": {
            if (config.sslmode !== "verify-full") {
              deprecatedSslModeWarning(config.sslmode);
            }
            break;
          }
          case "no-verify": {
            config.ssl.rejectUnauthorized = false;
            break;
          }
        }
      }
      return config;
    }
    function toConnectionOptions(sslConfig) {
      const connectionOptions = Object.entries(sslConfig).reduce((c, [key, value]) => {
        if (value !== void 0 && value !== null) {
          c[key] = value;
        }
        return c;
      }, /* @__PURE__ */ Object.create(null));
      return connectionOptions;
    }
    function toClientConfig(config) {
      const poolConfig = Object.entries(config).reduce((c, [key, value]) => {
        if (key === "ssl") {
          const sslConfig = value;
          if (typeof sslConfig === "boolean") {
            c[key] = sslConfig;
          }
          if (typeof sslConfig === "object") {
            c[key] = toConnectionOptions(sslConfig);
          }
        } else if (value !== void 0 && value !== null) {
          if (key === "port") {
            if (value !== "") {
              const v = parseInt(value, 10);
              if (isNaN(v)) {
                throw new Error(`Invalid ${key}: ${value}`);
              }
              c[key] = v;
            }
          } else {
            c[key] = value;
          }
        }
        return c;
      }, /* @__PURE__ */ Object.create(null));
      return poolConfig;
    }
    function parseIntoClientConfig(str) {
      return toClientConfig(parse2(str));
    }
    function deprecatedSslModeWarning(sslmode) {
      if (!deprecatedSslModeWarning.warned && typeof process !== "undefined" && process.emitWarning) {
        deprecatedSslModeWarning.warned = true;
        process.emitWarning(`SECURITY WARNING: The SSL modes 'prefer', 'require', and 'verify-ca' are treated as aliases for 'verify-full'.
In the next major version (pg-connection-string v3.0.0 and pg v9.0.0), these modes will adopt standard libpq semantics, which have weaker security guarantees.

To prepare for this change:
- If you want the current behavior, explicitly use 'sslmode=verify-full'
- If you want libpq compatibility now, use 'uselibpqcompat=true&sslmode=${sslmode}'

See https://www.postgresql.org/docs/current/libpq-ssl.html for libpq SSL mode definitions.`);
      }
    }
    module2.exports = parse2;
    parse2.parse = parse2;
    parse2.toClientConfig = toClientConfig;
    parse2.parseIntoClientConfig = parseIntoClientConfig;
  }
});

// node_modules/pg/lib/connection-parameters.js
var require_connection_parameters = __commonJS({
  "node_modules/pg/lib/connection-parameters.js"(exports2, module2) {
    "use strict";
    var dns = require("dns");
    var defaults2 = require_defaults();
    var parse2 = require_pg_connection_string().parse;
    var val = function(key, config, envVar) {
      if (config[key]) {
        return config[key];
      }
      if (envVar === void 0) {
        envVar = process.env["PG" + key.toUpperCase()];
      } else if (envVar === false) {
      } else {
        envVar = process.env[envVar];
      }
      return envVar || defaults2[key];
    };
    var readSSLConfigFromEnvironment = function() {
      switch (process.env.PGSSLMODE) {
        case "disable":
          return false;
        case "prefer":
        case "require":
        case "verify-ca":
        case "verify-full":
          return true;
        case "no-verify":
          return { rejectUnauthorized: false };
      }
      return defaults2.ssl;
    };
    var quoteParamValue = function(value) {
      return "'" + ("" + value).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
    };
    var add = function(params, config, paramName) {
      const value = config[paramName];
      if (value !== void 0 && value !== null) {
        params.push(paramName + "=" + quoteParamValue(value));
      }
    };
    var ConnectionParameters = class {
      constructor(config) {
        config = typeof config === "string" ? parse2(config) : config || {};
        if (config.connectionString) {
          config = Object.assign({}, config, parse2(config.connectionString));
        }
        this.user = val("user", config);
        this.database = val("database", config);
        if (this.database === void 0) {
          this.database = this.user;
        }
        this.port = parseInt(val("port", config), 10);
        this.host = val("host", config);
        Object.defineProperty(this, "password", {
          configurable: true,
          enumerable: false,
          writable: true,
          value: val("password", config)
        });
        this.binary = val("binary", config);
        this.options = val("options", config);
        this.ssl = typeof config.ssl === "undefined" ? readSSLConfigFromEnvironment() : config.ssl;
        if (typeof this.ssl === "string") {
          if (this.ssl === "true") {
            this.ssl = true;
          }
        }
        if (this.ssl === "no-verify") {
          this.ssl = { rejectUnauthorized: false };
        }
        if (this.ssl && this.ssl.key) {
          Object.defineProperty(this.ssl, "key", {
            enumerable: false
          });
        }
        this.sslnegotiation = val("sslnegotiation", config, "PGSSLNEGOTIATION");
        if (this.sslnegotiation !== void 0 && this.sslnegotiation !== "postgres" && this.sslnegotiation !== "direct") {
          throw new Error(
            `Invalid sslnegotiation value: "${this.sslnegotiation}". Valid values are "postgres" and "direct".`
          );
        }
        if (this.sslnegotiation === "direct" && !this.ssl) {
          throw new Error("sslnegotiation=direct requires SSL to be enabled");
        }
        this.client_encoding = val("client_encoding", config);
        this.replication = val("replication", config);
        this.isDomainSocket = !(this.host || "").indexOf("/");
        this.application_name = val("application_name", config, "PGAPPNAME");
        this.fallback_application_name = val("fallback_application_name", config, false);
        this.statement_timeout = val("statement_timeout", config, false);
        this.lock_timeout = val("lock_timeout", config, false);
        this.idle_in_transaction_session_timeout = val("idle_in_transaction_session_timeout", config, false);
        this.query_timeout = val("query_timeout", config, false);
        if (config.connectionTimeoutMillis === void 0) {
          this.connect_timeout = process.env.PGCONNECT_TIMEOUT || 0;
        } else {
          this.connect_timeout = Math.floor(config.connectionTimeoutMillis / 1e3);
        }
        if (config.keepAlive === false) {
          this.keepalives = 0;
        } else if (config.keepAlive === true) {
          this.keepalives = 1;
        }
        if (typeof config.keepAliveInitialDelayMillis === "number") {
          this.keepalives_idle = Math.floor(config.keepAliveInitialDelayMillis / 1e3);
        }
      }
      getLibpqConnectionString(cb) {
        const params = [];
        add(params, this, "user");
        add(params, this, "password");
        add(params, this, "port");
        add(params, this, "application_name");
        add(params, this, "fallback_application_name");
        add(params, this, "connect_timeout");
        add(params, this, "options");
        const ssl = typeof this.ssl === "object" ? this.ssl : this.ssl ? { sslmode: this.ssl } : {};
        add(params, ssl, "sslmode");
        add(params, ssl, "sslca");
        add(params, ssl, "sslkey");
        add(params, ssl, "sslcert");
        add(params, ssl, "sslrootcert");
        add(params, this, "sslnegotiation");
        if (this.database) {
          params.push("dbname=" + quoteParamValue(this.database));
        }
        if (this.replication) {
          params.push("replication=" + quoteParamValue(this.replication));
        }
        if (this.host) {
          params.push("host=" + quoteParamValue(this.host));
        }
        if (this.isDomainSocket) {
          return cb(null, params.join(" "));
        }
        if (this.client_encoding) {
          params.push("client_encoding=" + quoteParamValue(this.client_encoding));
        }
        dns.lookup(this.host, function(err, address) {
          if (err) return cb(err, null);
          params.push("hostaddr=" + quoteParamValue(address));
          return cb(null, params.join(" "));
        });
      }
    };
    module2.exports = ConnectionParameters;
  }
});

// node_modules/pg/lib/result.js
var require_result = __commonJS({
  "node_modules/pg/lib/result.js"(exports2, module2) {
    "use strict";
    var types5 = require_pg_types();
    var matchRegexp = /^([A-Za-z]+)(?: (\d+))?(?: (\d+))?/;
    var Result2 = class {
      constructor(rowMode, types6) {
        this.command = null;
        this.rowCount = null;
        this.oid = null;
        this.rows = [];
        this.fields = [];
        this._parsers = void 0;
        this._types = types6;
        this.RowCtor = null;
        this.rowAsArray = rowMode === "array";
        if (this.rowAsArray) {
          this.parseRow = this._parseRowAsArray;
        }
        this._prebuiltEmptyResultObject = null;
      }
      // adds a command complete message
      addCommandComplete(msg) {
        let match;
        if (msg.text) {
          match = matchRegexp.exec(msg.text);
        } else {
          match = matchRegexp.exec(msg.command);
        }
        if (match) {
          this.command = match[1];
          if (match[3]) {
            this.oid = parseInt(match[2], 10);
            this.rowCount = parseInt(match[3], 10);
          } else if (match[2]) {
            this.rowCount = parseInt(match[2], 10);
          }
        }
      }
      _parseRowAsArray(rowData) {
        const row = new Array(rowData.length);
        for (let i = 0, len = rowData.length; i < len; i++) {
          const rawValue = rowData[i];
          if (rawValue !== null) {
            row[i] = this._parsers[i](rawValue);
          } else {
            row[i] = null;
          }
        }
        return row;
      }
      parseRow(rowData) {
        const row = { ...this._prebuiltEmptyResultObject };
        for (let i = 0, len = rowData.length; i < len; i++) {
          const rawValue = rowData[i];
          const field = this.fields[i].name;
          if (rawValue !== null) {
            const v = this.fields[i].format === "binary" ? Buffer.from(rawValue) : rawValue;
            row[field] = this._parsers[i](v);
          } else {
            row[field] = null;
          }
        }
        return row;
      }
      addRow(row) {
        this.rows.push(row);
      }
      addFields(fieldDescriptions) {
        this.fields = fieldDescriptions;
        if (this.fields.length) {
          this._parsers = new Array(fieldDescriptions.length);
        }
        const row = /* @__PURE__ */ Object.create(null);
        for (let i = 0; i < fieldDescriptions.length; i++) {
          const desc = fieldDescriptions[i];
          row[desc.name] = null;
          if (this._types) {
            this._parsers[i] = this._types.getTypeParser(desc.dataTypeID, desc.format || "text");
          } else {
            this._parsers[i] = types5.getTypeParser(desc.dataTypeID, desc.format || "text");
          }
        }
        this._prebuiltEmptyResultObject = { ...row };
      }
    };
    module2.exports = Result2;
  }
});

// node_modules/pg/lib/query.js
var require_query = __commonJS({
  "node_modules/pg/lib/query.js"(exports2, module2) {
    "use strict";
    var { EventEmitter } = require("events");
    var Result2 = require_result();
    var utils = require_utils();
    var Query2 = class extends EventEmitter {
      constructor(config, values, callback) {
        super();
        config = utils.normalizeQueryConfig(config, values, callback);
        this.text = config.text;
        this.values = config.values;
        this.rows = config.rows;
        this.types = config.types;
        this.name = config.name;
        this.queryMode = config.queryMode;
        this.binary = config.binary;
        this.portal = config.portal || "";
        this.callback = config.callback;
        this._rowMode = config.rowMode;
        if (process.domain && config.callback) {
          this.callback = process.domain.bind(config.callback);
        }
        this._result = new Result2(this._rowMode, this.types);
        this._results = this._result;
        this._canceledDueToError = false;
      }
      requiresPreparation() {
        if (this.queryMode === "extended") {
          return true;
        }
        if (this.name) {
          return true;
        }
        if (this.rows) {
          return true;
        }
        if (!this.text) {
          return false;
        }
        if (!this.values) {
          return false;
        }
        return this.values.length > 0;
      }
      _checkForMultirow() {
        if (this._result.command) {
          if (!Array.isArray(this._results)) {
            this._results = [this._result];
          }
          this._result = new Result2(this._rowMode, this._result._types);
          this._results.push(this._result);
        }
      }
      // associates row metadata from the supplied
      // message with this query object
      // metadata used when parsing row results
      handleRowDescription(msg) {
        this._checkForMultirow();
        this._result.addFields(msg.fields);
        this._accumulateRows = this.callback || !this.listeners("row").length;
      }
      handleDataRow(msg) {
        let row;
        if (this._canceledDueToError) {
          return;
        }
        try {
          row = this._result.parseRow(msg.fields);
        } catch (err) {
          this._canceledDueToError = err;
          return;
        }
        this.emit("row", row, this._result);
        if (this._accumulateRows) {
          this._result.addRow(row);
        }
      }
      handleCommandComplete(msg, connection) {
        this._checkForMultirow();
        this._result.addCommandComplete(msg);
        if (this.rows) {
          connection.sync();
        }
      }
      // if a named prepared statement is created with empty query text
      // the backend will send an emptyQuery message but *not* a command complete message
      // since we pipeline sync immediately after execute we don't need to do anything here
      // unless we have rows specified, in which case we did not pipeline the initial sync call
      handleEmptyQuery(connection) {
        if (this.rows) {
          connection.sync();
        }
      }
      handleError(err, connection) {
        if (this._canceledDueToError) {
          err = this._canceledDueToError;
          this._canceledDueToError = false;
        }
        if (this.callback) {
          return this.callback(err);
        }
        this.emit("error", err);
      }
      handleReadyForQuery(con) {
        if (this._canceledDueToError) {
          return this.handleError(this._canceledDueToError, con);
        }
        if (this.callback) {
          try {
            this.callback(null, this._results);
          } catch (err) {
            process.nextTick(() => {
              throw err;
            });
          }
        }
        this.emit("end", this._results);
      }
      submit(connection) {
        if (typeof this.text !== "string" && typeof this.name !== "string") {
          return new Error("A query must have either text or a name. Supplying neither is unsupported.");
        }
        const previous = connection.parsedStatements[this.name];
        if (this.text && previous && this.text !== previous) {
          return new Error(`Prepared statements must be unique - '${this.name}' was used for a different statement`);
        }
        if (this.values && !Array.isArray(this.values)) {
          return new Error("Query values must be an array");
        }
        if (this.requiresPreparation()) {
          connection.stream.cork && connection.stream.cork();
          try {
            this.prepare(connection);
          } finally {
            connection.stream.uncork && connection.stream.uncork();
          }
        } else {
          connection.query(this.text);
        }
        return null;
      }
      hasBeenParsed(connection) {
        return this.name && connection.parsedStatements[this.name];
      }
      handlePortalSuspended(connection) {
        this._getRows(connection, this.rows);
      }
      _getRows(connection, rows) {
        connection.execute({
          portal: this.portal,
          rows
        });
        if (!rows) {
          connection.sync();
        } else {
          connection.flush();
        }
      }
      // http://developer.postgresql.org/pgdocs/postgres/protocol-flow.html#PROTOCOL-FLOW-EXT-QUERY
      prepare(connection) {
        if (!this.hasBeenParsed(connection)) {
          connection.parse({
            text: this.text,
            name: this.name,
            types: this.types
          });
        }
        try {
          connection.bind({
            portal: this.portal,
            statement: this.name,
            values: this.values,
            binary: this.binary,
            valueMapper: utils.prepareValue
          });
        } catch (err) {
          connection.close({ type: "S", name: this.name });
          connection.sync();
          this.handleError(err, connection);
          return;
        }
        connection.describe({
          type: "P",
          name: this.portal || ""
        });
        this._getRows(connection, this.rows);
      }
      handleCopyInResponse(connection) {
        connection.sendCopyFail("No source stream defined");
      }
      handleCopyData(msg, connection) {
      }
    };
    module2.exports = Query2;
  }
});

// node_modules/pg-protocol/dist/messages.js
var require_messages = __commonJS({
  "node_modules/pg-protocol/dist/messages.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.NoticeMessage = exports2.DataRowMessage = exports2.CommandCompleteMessage = exports2.ReadyForQueryMessage = exports2.NotificationResponseMessage = exports2.BackendKeyDataMessage = exports2.AuthenticationMD5Password = exports2.ParameterStatusMessage = exports2.ParameterDescriptionMessage = exports2.RowDescriptionMessage = exports2.Field = exports2.CopyResponse = exports2.CopyDataMessage = exports2.DatabaseError = exports2.copyDone = exports2.emptyQuery = exports2.replicationStart = exports2.portalSuspended = exports2.noData = exports2.closeComplete = exports2.bindComplete = exports2.parseComplete = void 0;
    exports2.parseComplete = {
      name: "parseComplete",
      length: 5
    };
    exports2.bindComplete = {
      name: "bindComplete",
      length: 5
    };
    exports2.closeComplete = {
      name: "closeComplete",
      length: 5
    };
    exports2.noData = {
      name: "noData",
      length: 5
    };
    exports2.portalSuspended = {
      name: "portalSuspended",
      length: 5
    };
    exports2.replicationStart = {
      name: "replicationStart",
      length: 4
    };
    exports2.emptyQuery = {
      name: "emptyQuery",
      length: 4
    };
    exports2.copyDone = {
      name: "copyDone",
      length: 4
    };
    var DatabaseError2 = class extends Error {
      constructor(message2, length, name) {
        super(message2);
        this.length = length;
        this.name = name;
      }
    };
    exports2.DatabaseError = DatabaseError2;
    var CopyDataMessage = class {
      constructor(length, chunk) {
        this.length = length;
        this.chunk = chunk;
        this.name = "copyData";
      }
    };
    exports2.CopyDataMessage = CopyDataMessage;
    var CopyResponse = class {
      constructor(length, name, binary, columnCount) {
        this.length = length;
        this.name = name;
        this.binary = binary;
        this.columnTypes = new Array(columnCount);
      }
    };
    exports2.CopyResponse = CopyResponse;
    var Field = class {
      constructor(name, tableID, columnID, dataTypeID, dataTypeSize, dataTypeModifier, format) {
        this.name = name;
        this.tableID = tableID;
        this.columnID = columnID;
        this.dataTypeID = dataTypeID;
        this.dataTypeSize = dataTypeSize;
        this.dataTypeModifier = dataTypeModifier;
        this.format = format;
      }
    };
    exports2.Field = Field;
    var RowDescriptionMessage = class {
      constructor(length, fieldCount) {
        this.length = length;
        this.fieldCount = fieldCount;
        this.name = "rowDescription";
        this.fields = new Array(this.fieldCount);
      }
    };
    exports2.RowDescriptionMessage = RowDescriptionMessage;
    var ParameterDescriptionMessage = class {
      constructor(length, parameterCount) {
        this.length = length;
        this.parameterCount = parameterCount;
        this.name = "parameterDescription";
        this.dataTypeIDs = new Array(this.parameterCount);
      }
    };
    exports2.ParameterDescriptionMessage = ParameterDescriptionMessage;
    var ParameterStatusMessage = class {
      constructor(length, parameterName, parameterValue) {
        this.length = length;
        this.parameterName = parameterName;
        this.parameterValue = parameterValue;
        this.name = "parameterStatus";
      }
    };
    exports2.ParameterStatusMessage = ParameterStatusMessage;
    var AuthenticationMD5Password = class {
      constructor(length, salt) {
        this.length = length;
        this.salt = salt;
        this.name = "authenticationMD5Password";
      }
    };
    exports2.AuthenticationMD5Password = AuthenticationMD5Password;
    var BackendKeyDataMessage = class {
      constructor(length, processID, secretKey) {
        this.length = length;
        this.processID = processID;
        this.secretKey = secretKey;
        this.name = "backendKeyData";
      }
    };
    exports2.BackendKeyDataMessage = BackendKeyDataMessage;
    var NotificationResponseMessage = class {
      constructor(length, processId, channel, payload) {
        this.length = length;
        this.processId = processId;
        this.channel = channel;
        this.payload = payload;
        this.name = "notification";
      }
    };
    exports2.NotificationResponseMessage = NotificationResponseMessage;
    var ReadyForQueryMessage = class {
      constructor(length, status) {
        this.length = length;
        this.status = status;
        this.name = "readyForQuery";
      }
    };
    exports2.ReadyForQueryMessage = ReadyForQueryMessage;
    var CommandCompleteMessage = class {
      constructor(length, text) {
        this.length = length;
        this.text = text;
        this.name = "commandComplete";
      }
    };
    exports2.CommandCompleteMessage = CommandCompleteMessage;
    var DataRowMessage = class {
      constructor(length, fields) {
        this.length = length;
        this.fields = fields;
        this.name = "dataRow";
        this.fieldCount = fields.length;
      }
    };
    exports2.DataRowMessage = DataRowMessage;
    var NoticeMessage = class {
      constructor(length, message2) {
        this.length = length;
        this.message = message2;
        this.name = "notice";
      }
    };
    exports2.NoticeMessage = NoticeMessage;
  }
});

// node_modules/pg-protocol/dist/buffer-writer.js
var require_buffer_writer = __commonJS({
  "node_modules/pg-protocol/dist/buffer-writer.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Writer = void 0;
    var Writer = class {
      constructor(size = 256) {
        this.size = size;
        this.offset = 5;
        this.headerPosition = 0;
        this.buffer = Buffer.allocUnsafe(size);
      }
      ensure(size) {
        const remaining = this.buffer.length - this.offset;
        if (remaining < size) {
          const oldBuffer = this.buffer;
          const newSize = oldBuffer.length + (oldBuffer.length >> 1) + size;
          this.buffer = Buffer.allocUnsafe(newSize);
          oldBuffer.copy(this.buffer);
        }
      }
      addInt32(num) {
        this.ensure(4);
        this.buffer[this.offset++] = num >>> 24 & 255;
        this.buffer[this.offset++] = num >>> 16 & 255;
        this.buffer[this.offset++] = num >>> 8 & 255;
        this.buffer[this.offset++] = num >>> 0 & 255;
        return this;
      }
      addInt16(num) {
        this.ensure(2);
        this.buffer[this.offset++] = num >>> 8 & 255;
        this.buffer[this.offset++] = num >>> 0 & 255;
        return this;
      }
      addCString(string) {
        if (!string) {
          this.ensure(1);
        } else {
          const len = Buffer.byteLength(string);
          this.ensure(len + 1);
          this.buffer.write(string, this.offset, "utf-8");
          this.offset += len;
        }
        this.buffer[this.offset++] = 0;
        return this;
      }
      addString(string = "") {
        const len = Buffer.byteLength(string);
        this.ensure(len);
        this.buffer.write(string, this.offset);
        this.offset += len;
        return this;
      }
      // Write an Int32 byte-length prefix immediately followed by the string's UTF-8
      // bytes. Postgres' Bind wire format prefixes every parameter with its length,
      // and doing it in one method computes Buffer.byteLength ONCE — the previous
      // `addInt32(Buffer.byteLength(s)).addString(s)` pairing scanned the string
      // three times (byteLength for the prefix, byteLength again inside addString,
      // then the encode), which is costly for large text parameters.
      addInt32PrefixedString(string) {
        const len = Buffer.byteLength(string);
        this.ensure(4 + len);
        const buffer = this.buffer;
        let offset = this.offset;
        buffer[offset++] = len >>> 24 & 255;
        buffer[offset++] = len >>> 16 & 255;
        buffer[offset++] = len >>> 8 & 255;
        buffer[offset++] = len >>> 0 & 255;
        buffer.write(string, offset, "utf-8");
        this.offset = offset + len;
        return this;
      }
      add(otherBuffer) {
        this.ensure(otherBuffer.length);
        otherBuffer.copy(this.buffer, this.offset);
        this.offset += otherBuffer.length;
        return this;
      }
      join(code) {
        if (code) {
          this.buffer[this.headerPosition] = code;
          const length = this.offset - (this.headerPosition + 1);
          this.buffer.writeInt32BE(length, this.headerPosition + 1);
        }
        return this.buffer.slice(code ? 0 : 5, this.offset);
      }
      flush(code) {
        const result = this.join(code);
        this.offset = 5;
        this.headerPosition = 0;
        this.buffer = Buffer.allocUnsafe(this.size);
        return result;
      }
      clear() {
        this.offset = 5;
        this.headerPosition = 0;
      }
    };
    exports2.Writer = Writer;
  }
});

// node_modules/pg-protocol/dist/serializer.js
var require_serializer = __commonJS({
  "node_modules/pg-protocol/dist/serializer.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.serialize = void 0;
    var buffer_writer_1 = require_buffer_writer();
    var writer = new buffer_writer_1.Writer();
    var startup = (opts) => {
      writer.addInt16(3).addInt16(0);
      for (const key of Object.keys(opts)) {
        writer.addCString(key).addCString(opts[key]);
      }
      writer.addCString("client_encoding").addCString("UTF8");
      const bodyBuffer = writer.addCString("").flush();
      const length = bodyBuffer.length + 4;
      return new buffer_writer_1.Writer().addInt32(length).add(bodyBuffer).flush();
    };
    var requestSsl = () => {
      const response = Buffer.allocUnsafe(8);
      response.writeInt32BE(8, 0);
      response.writeInt32BE(80877103, 4);
      return response;
    };
    var password = (password2) => {
      return writer.addCString(password2).flush(
        112
        /* code.startup */
      );
    };
    var sendSASLInitialResponseMessage = function(mechanism, initialResponse) {
      writer.addCString(mechanism).addInt32PrefixedString(initialResponse);
      return writer.flush(
        112
        /* code.startup */
      );
    };
    var sendSCRAMClientFinalMessage = function(additionalData) {
      return writer.addString(additionalData).flush(
        112
        /* code.startup */
      );
    };
    var query2 = (text) => {
      return writer.addCString(text).flush(
        81
        /* code.query */
      );
    };
    var emptyArray = [];
    var parse2 = (query3) => {
      const name = query3.name || "";
      if (name.length > 63) {
        console.error("Warning! Postgres only supports 63 characters for query names.");
        console.error("You supplied %s (%s)", name, name.length);
        console.error("This can cause conflicts and silent errors executing queries");
      }
      const types5 = query3.types || emptyArray;
      const len = types5.length;
      const buffer = writer.addCString(name).addCString(query3.text).addInt16(len);
      for (let i = 0; i < len; i++) {
        buffer.addInt32(types5[i]);
      }
      return writer.flush(
        80
        /* code.parse */
      );
    };
    var paramWriter = new buffer_writer_1.Writer();
    var writeValues = function(values, valueMapper) {
      for (let i = 0; i < values.length; i++) {
        const mappedVal = valueMapper ? valueMapper(values[i], i) : values[i];
        if (mappedVal == null) {
          writer.addInt16(
            0
            /* ParamType.STRING */
          );
          paramWriter.addInt32(-1);
        } else if (mappedVal instanceof Buffer) {
          writer.addInt16(
            1
            /* ParamType.BINARY */
          );
          paramWriter.addInt32(mappedVal.length);
          paramWriter.add(mappedVal);
        } else {
          writer.addInt16(
            0
            /* ParamType.STRING */
          );
          paramWriter.addInt32PrefixedString(mappedVal);
        }
      }
    };
    var bind = (config = {}) => {
      const portal = config.portal || "";
      const statement = config.statement || "";
      const binary = config.binary || false;
      const values = config.values || emptyArray;
      const len = values.length;
      writer.addCString(portal).addCString(statement);
      writer.addInt16(len);
      try {
        writeValues(values, config.valueMapper);
      } catch (err) {
        writer.clear();
        paramWriter.clear();
        throw err;
      }
      writer.addInt16(len);
      writer.add(paramWriter.flush());
      writer.addInt16(1);
      writer.addInt16(
        binary ? 1 : 0
        /* ParamType.STRING */
      );
      return writer.flush(
        66
        /* code.bind */
      );
    };
    var emptyExecute = Buffer.from([69, 0, 0, 0, 9, 0, 0, 0, 0, 0]);
    var execute = (config) => {
      if (!config || !config.portal && !config.rows) {
        return emptyExecute;
      }
      const portal = config.portal || "";
      const rows = config.rows || 0;
      const portalLength = Buffer.byteLength(portal);
      const len = 4 + portalLength + 1 + 4;
      const buff = Buffer.allocUnsafe(1 + len);
      buff[0] = 69;
      buff.writeInt32BE(len, 1);
      buff.write(portal, 5, "utf-8");
      buff[portalLength + 5] = 0;
      buff.writeUInt32BE(rows, buff.length - 4);
      return buff;
    };
    var cancel = (processID, secretKey) => {
      const buffer = Buffer.allocUnsafe(16);
      buffer.writeInt32BE(16, 0);
      buffer.writeInt16BE(1234, 4);
      buffer.writeInt16BE(5678, 6);
      buffer.writeInt32BE(processID, 8);
      buffer.writeInt32BE(secretKey, 12);
      return buffer;
    };
    var cstringMessage = (code, string) => {
      const stringLen = Buffer.byteLength(string);
      const len = 4 + stringLen + 1;
      const buffer = Buffer.allocUnsafe(1 + len);
      buffer[0] = code;
      buffer.writeInt32BE(len, 1);
      buffer.write(string, 5, "utf-8");
      buffer[len] = 0;
      return buffer;
    };
    var emptyDescribePortal = writer.addCString("P").flush(
      68
      /* code.describe */
    );
    var emptyDescribeStatement = writer.addCString("S").flush(
      68
      /* code.describe */
    );
    var describe = (msg) => {
      return msg.name ? cstringMessage(68, `${msg.type}${msg.name || ""}`) : msg.type === "P" ? emptyDescribePortal : emptyDescribeStatement;
    };
    var close = (msg) => {
      const text = `${msg.type}${msg.name || ""}`;
      return cstringMessage(67, text);
    };
    var copyData = (chunk) => {
      return writer.add(chunk).flush(
        100
        /* code.copyFromChunk */
      );
    };
    var copyFail = (message2) => {
      return cstringMessage(102, message2);
    };
    var codeOnlyBuffer = (code) => Buffer.from([code, 0, 0, 0, 4]);
    var flushBuffer = codeOnlyBuffer(
      72
      /* code.flush */
    );
    var syncBuffer = codeOnlyBuffer(
      83
      /* code.sync */
    );
    var endBuffer = codeOnlyBuffer(
      88
      /* code.end */
    );
    var copyDoneBuffer = codeOnlyBuffer(
      99
      /* code.copyDone */
    );
    var serialize = {
      startup,
      password,
      requestSsl,
      sendSASLInitialResponseMessage,
      sendSCRAMClientFinalMessage,
      query: query2,
      parse: parse2,
      bind,
      execute,
      describe,
      close,
      flush: () => flushBuffer,
      sync: () => syncBuffer,
      end: () => endBuffer,
      copyData,
      copyDone: () => copyDoneBuffer,
      copyFail,
      cancel
    };
    exports2.serialize = serialize;
  }
});

// node_modules/pg-protocol/dist/buffer-reader.js
var require_buffer_reader = __commonJS({
  "node_modules/pg-protocol/dist/buffer-reader.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.BufferReader = void 0;
    var BufferReader = class {
      constructor(offset = 0) {
        this.offset = offset;
        this.buffer = Buffer.allocUnsafe(0);
        this.encoding = "utf-8";
      }
      setBuffer(offset, buffer) {
        this.offset = offset;
        this.buffer = buffer;
      }
      int16() {
        const result = this.buffer.readInt16BE(this.offset);
        this.offset += 2;
        return result;
      }
      byte() {
        const result = this.buffer[this.offset];
        this.offset++;
        return result;
      }
      int32() {
        const result = this.buffer.readInt32BE(this.offset);
        this.offset += 4;
        return result;
      }
      uint32() {
        const result = this.buffer.readUInt32BE(this.offset);
        this.offset += 4;
        return result;
      }
      string(length) {
        const result = this.buffer.toString(this.encoding, this.offset, this.offset + length);
        this.offset += length;
        return result;
      }
      cstring() {
        const start = this.offset;
        let end = start;
        while (this.buffer[end++]) {
        }
        this.offset = end;
        return this.buffer.toString(this.encoding, start, end - 1);
      }
      bytes(length) {
        const result = this.buffer.slice(this.offset, this.offset + length);
        this.offset += length;
        return result;
      }
    };
    exports2.BufferReader = BufferReader;
  }
});

// node_modules/pg-protocol/dist/parser.js
var require_parser = __commonJS({
  "node_modules/pg-protocol/dist/parser.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Parser = void 0;
    var messages_1 = require_messages();
    var buffer_reader_1 = require_buffer_reader();
    var CODE_LENGTH = 1;
    var LEN_LENGTH = 4;
    var HEADER_LENGTH = CODE_LENGTH + LEN_LENGTH;
    var LATEINIT_LENGTH = -1;
    var emptyBuffer = Buffer.allocUnsafe(0);
    var Parser = class {
      constructor(opts) {
        this.buffer = emptyBuffer;
        this.bufferLength = 0;
        this.bufferOffset = 0;
        this.reader = new buffer_reader_1.BufferReader();
        if ((opts === null || opts === void 0 ? void 0 : opts.mode) === "binary") {
          throw new Error("Binary mode not supported yet");
        }
        this.mode = (opts === null || opts === void 0 ? void 0 : opts.mode) || "text";
      }
      parse(buffer, callback) {
        this.mergeBuffer(buffer);
        const bufferFullLength = this.bufferOffset + this.bufferLength;
        let offset = this.bufferOffset;
        while (offset + HEADER_LENGTH <= bufferFullLength) {
          const code = this.buffer[offset];
          const length = this.buffer.readUInt32BE(offset + CODE_LENGTH);
          const fullMessageLength = CODE_LENGTH + length;
          if (fullMessageLength + offset <= bufferFullLength) {
            const message2 = this.handlePacket(offset + HEADER_LENGTH, code, length, this.buffer);
            callback(message2);
            offset += fullMessageLength;
          } else {
            break;
          }
        }
        if (offset === bufferFullLength) {
          this.buffer = emptyBuffer;
          this.bufferLength = 0;
          this.bufferOffset = 0;
        } else {
          this.bufferLength = bufferFullLength - offset;
          this.bufferOffset = offset;
        }
      }
      mergeBuffer(buffer) {
        if (this.bufferLength > 0) {
          const newLength = this.bufferLength + buffer.byteLength;
          const newFullLength = newLength + this.bufferOffset;
          if (newFullLength > this.buffer.byteLength) {
            let newBuffer;
            if (newLength <= this.buffer.byteLength && this.bufferOffset >= this.bufferLength) {
              newBuffer = this.buffer;
            } else {
              let newBufferLength = this.buffer.byteLength * 2;
              while (newLength >= newBufferLength) {
                newBufferLength *= 2;
              }
              newBuffer = Buffer.allocUnsafe(newBufferLength);
            }
            this.buffer.copy(newBuffer, 0, this.bufferOffset, this.bufferOffset + this.bufferLength);
            this.buffer = newBuffer;
            this.bufferOffset = 0;
          }
          buffer.copy(this.buffer, this.bufferOffset + this.bufferLength);
          this.bufferLength = newLength;
        } else {
          this.buffer = buffer;
          this.bufferOffset = 0;
          this.bufferLength = buffer.byteLength;
        }
      }
      handlePacket(offset, code, length, bytes) {
        const { reader } = this;
        reader.setBuffer(offset, bytes);
        let message2;
        switch (code) {
          case 50:
            message2 = messages_1.bindComplete;
            break;
          case 49:
            message2 = messages_1.parseComplete;
            break;
          case 51:
            message2 = messages_1.closeComplete;
            break;
          case 110:
            message2 = messages_1.noData;
            break;
          case 115:
            message2 = messages_1.portalSuspended;
            break;
          case 99:
            message2 = messages_1.copyDone;
            break;
          case 87:
            message2 = messages_1.replicationStart;
            break;
          case 73:
            message2 = messages_1.emptyQuery;
            break;
          case 68:
            message2 = parseDataRowMessage(reader);
            break;
          case 67:
            message2 = parseCommandCompleteMessage(reader);
            break;
          case 90:
            message2 = parseReadyForQueryMessage(reader);
            break;
          case 65:
            message2 = parseNotificationMessage(reader);
            break;
          case 82:
            message2 = parseAuthenticationResponse(reader, length);
            break;
          case 83:
            message2 = parseParameterStatusMessage(reader);
            break;
          case 75:
            message2 = parseBackendKeyData(reader);
            break;
          case 69:
            message2 = parseErrorMessage(reader, "error");
            break;
          case 78:
            message2 = parseErrorMessage(reader, "notice");
            break;
          case 84:
            message2 = parseRowDescriptionMessage(reader);
            break;
          case 116:
            message2 = parseParameterDescriptionMessage(reader);
            break;
          case 71:
            message2 = parseCopyInMessage(reader);
            break;
          case 72:
            message2 = parseCopyOutMessage(reader);
            break;
          case 100:
            message2 = parseCopyData(reader, length);
            break;
          default:
            return new messages_1.DatabaseError("received invalid response: " + code.toString(16), length, "error");
        }
        reader.setBuffer(0, emptyBuffer);
        message2.length = length;
        return message2;
      }
    };
    exports2.Parser = Parser;
    var parseReadyForQueryMessage = (reader) => {
      const status = reader.string(1);
      return new messages_1.ReadyForQueryMessage(LATEINIT_LENGTH, status);
    };
    var parseCommandCompleteMessage = (reader) => {
      const text = reader.cstring();
      return new messages_1.CommandCompleteMessage(LATEINIT_LENGTH, text);
    };
    var parseCopyData = (reader, length) => {
      const chunk = reader.bytes(length - 4);
      return new messages_1.CopyDataMessage(LATEINIT_LENGTH, chunk);
    };
    var parseCopyInMessage = (reader) => parseCopyMessage(reader, "copyInResponse");
    var parseCopyOutMessage = (reader) => parseCopyMessage(reader, "copyOutResponse");
    var parseCopyMessage = (reader, messageName) => {
      const isBinary = reader.byte() !== 0;
      const columnCount = reader.int16();
      const message2 = new messages_1.CopyResponse(LATEINIT_LENGTH, messageName, isBinary, columnCount);
      for (let i = 0; i < columnCount; i++) {
        message2.columnTypes[i] = reader.int16();
      }
      return message2;
    };
    var parseNotificationMessage = (reader) => {
      const processId = reader.int32();
      const channel = reader.cstring();
      const payload = reader.cstring();
      return new messages_1.NotificationResponseMessage(LATEINIT_LENGTH, processId, channel, payload);
    };
    var parseRowDescriptionMessage = (reader) => {
      const fieldCount = reader.int16();
      const message2 = new messages_1.RowDescriptionMessage(LATEINIT_LENGTH, fieldCount);
      for (let i = 0; i < fieldCount; i++) {
        message2.fields[i] = parseField(reader);
      }
      return message2;
    };
    var parseField = (reader) => {
      const name = reader.cstring();
      const tableID = reader.uint32();
      const columnID = reader.int16();
      const dataTypeID = reader.uint32();
      const dataTypeSize = reader.int16();
      const dataTypeModifier = reader.int32();
      const mode = reader.int16() === 0 ? "text" : "binary";
      return new messages_1.Field(name, tableID, columnID, dataTypeID, dataTypeSize, dataTypeModifier, mode);
    };
    var parseParameterDescriptionMessage = (reader) => {
      const parameterCount = reader.int16();
      const message2 = new messages_1.ParameterDescriptionMessage(LATEINIT_LENGTH, parameterCount);
      for (let i = 0; i < parameterCount; i++) {
        message2.dataTypeIDs[i] = reader.int32();
      }
      return message2;
    };
    var parseDataRowMessage = (reader) => {
      const fieldCount = reader.int16();
      const fields = new Array(fieldCount);
      for (let i = 0; i < fieldCount; i++) {
        const len = reader.int32();
        fields[i] = len === -1 ? null : reader.string(len);
      }
      return new messages_1.DataRowMessage(LATEINIT_LENGTH, fields);
    };
    var parseParameterStatusMessage = (reader) => {
      const name = reader.cstring();
      const value = reader.cstring();
      return new messages_1.ParameterStatusMessage(LATEINIT_LENGTH, name, value);
    };
    var parseBackendKeyData = (reader) => {
      const processID = reader.int32();
      const secretKey = reader.int32();
      return new messages_1.BackendKeyDataMessage(LATEINIT_LENGTH, processID, secretKey);
    };
    var parseAuthenticationResponse = (reader, length) => {
      const code = reader.int32();
      const message2 = {
        name: "authenticationOk",
        length
      };
      switch (code) {
        case 0:
          break;
        case 3:
          if (message2.length === 8) {
            message2.name = "authenticationCleartextPassword";
          }
          break;
        case 5:
          if (message2.length === 12) {
            message2.name = "authenticationMD5Password";
            const salt = reader.bytes(4);
            return new messages_1.AuthenticationMD5Password(LATEINIT_LENGTH, salt);
          }
          break;
        case 10:
          {
            message2.name = "authenticationSASL";
            message2.mechanisms = [];
            let mechanism;
            do {
              mechanism = reader.cstring();
              if (mechanism) {
                message2.mechanisms.push(mechanism);
              }
            } while (mechanism);
          }
          break;
        case 11:
          message2.name = "authenticationSASLContinue";
          message2.data = reader.string(length - 8);
          break;
        case 12:
          message2.name = "authenticationSASLFinal";
          message2.data = reader.string(length - 8);
          break;
        default:
          throw new Error("Unknown authenticationOk message type " + code);
      }
      return message2;
    };
    var parseErrorMessage = (reader, name) => {
      const fields = {};
      let fieldType = reader.string(1);
      while (fieldType !== "\0") {
        fields[fieldType] = reader.cstring();
        fieldType = reader.string(1);
      }
      const messageValue = fields.M;
      const message2 = name === "notice" ? new messages_1.NoticeMessage(LATEINIT_LENGTH, messageValue) : new messages_1.DatabaseError(messageValue, LATEINIT_LENGTH, name);
      message2.severity = fields.S;
      message2.code = fields.C;
      message2.detail = fields.D;
      message2.hint = fields.H;
      message2.position = fields.P;
      message2.internalPosition = fields.p;
      message2.internalQuery = fields.q;
      message2.where = fields.W;
      message2.schema = fields.s;
      message2.table = fields.t;
      message2.column = fields.c;
      message2.dataType = fields.d;
      message2.constraint = fields.n;
      message2.file = fields.F;
      message2.line = fields.L;
      message2.routine = fields.R;
      return message2;
    };
  }
});

// node_modules/pg-protocol/dist/index.js
var require_dist = __commonJS({
  "node_modules/pg-protocol/dist/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.DatabaseError = exports2.serialize = void 0;
    exports2.parse = parse2;
    var messages_1 = require_messages();
    Object.defineProperty(exports2, "DatabaseError", { enumerable: true, get: function() {
      return messages_1.DatabaseError;
    } });
    var serializer_1 = require_serializer();
    Object.defineProperty(exports2, "serialize", { enumerable: true, get: function() {
      return serializer_1.serialize;
    } });
    var parser_1 = require_parser();
    function parse2(stream, callback) {
      const parser = new parser_1.Parser();
      stream.on("data", (buffer) => parser.parse(buffer, callback));
      return new Promise((resolve) => stream.on("end", () => resolve()));
    }
  }
});

// node_modules/pg-cloudflare/dist/empty.js
var require_empty = __commonJS({
  "node_modules/pg-cloudflare/dist/empty.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.default = {};
  }
});

// node_modules/pg/lib/stream.js
var require_stream = __commonJS({
  "node_modules/pg/lib/stream.js"(exports2, module2) {
    var { getStream, getSecureStream } = getStreamFuncs();
    module2.exports = {
      /**
       * Get a socket stream compatible with the current runtime environment.
       * @returns {Duplex}
       */
      getStream,
      /**
       * Get a TLS secured socket, compatible with the current environment,
       * using the socket and other settings given in `options`.
       * @returns {Duplex}
       */
      getSecureStream
    };
    function getNodejsStreamFuncs() {
      function getStream2(ssl) {
        const net = require("net");
        return new net.Socket();
      }
      function getSecureStream2(options) {
        const tls = require("tls");
        return tls.connect(options);
      }
      return {
        getStream: getStream2,
        getSecureStream: getSecureStream2
      };
    }
    function getCloudflareStreamFuncs() {
      function getStream2(ssl) {
        const { CloudflareSocket } = require_empty();
        return new CloudflareSocket(ssl);
      }
      function getSecureStream2(options) {
        options.socket.startTls(options);
        return options.socket;
      }
      return {
        getStream: getStream2,
        getSecureStream: getSecureStream2
      };
    }
    function isCloudflareRuntime() {
      if (typeof navigator === "object" && navigator !== null && typeof navigator.userAgent === "string") {
        return navigator.userAgent === "Cloudflare-Workers";
      }
      if (typeof Response === "function") {
        const resp = new Response(null, { cf: { thing: true } });
        if (typeof resp.cf === "object" && resp.cf !== null && resp.cf.thing) {
          return true;
        }
      }
      return false;
    }
    function getStreamFuncs() {
      if (isCloudflareRuntime()) {
        return getCloudflareStreamFuncs();
      }
      return getNodejsStreamFuncs();
    }
  }
});

// node_modules/pg/lib/connection.js
var require_connection = __commonJS({
  "node_modules/pg/lib/connection.js"(exports2, module2) {
    "use strict";
    var EventEmitter = require("events").EventEmitter;
    var { parse: parse2, serialize } = require_dist();
    var stream = require_stream();
    var { getStream } = stream;
    var flushBuffer = serialize.flush();
    var syncBuffer = serialize.sync();
    var endBuffer = serialize.end();
    var Connection2 = class extends EventEmitter {
      constructor(config) {
        super();
        config = config || {};
        this.stream = config.stream || getStream(config.ssl);
        if (typeof this.stream === "function") {
          this.stream = this.stream(config);
        }
        this._keepAlive = config.keepAlive;
        this._keepAliveInitialDelayMillis = config.keepAliveInitialDelayMillis;
        this.parsedStatements = {};
        this.ssl = config.ssl || false;
        this.sslNegotiation = config.sslNegotiation || "postgres";
        this._ending = false;
        this._emitMessage = false;
        const self = this;
        this.on("newListener", function(eventName) {
          if (eventName === "message") {
            self._emitMessage = true;
          }
        });
      }
      connect(port, host) {
        const self = this;
        this._connecting = true;
        this.stream.setNoDelay(true);
        this.stream.connect(port, host);
        this.stream.once("connect", function() {
          if (self._keepAlive) {
            self.stream.setKeepAlive(true, self._keepAliveInitialDelayMillis);
          }
          self.emit("connect");
        });
        const reportStreamError = function(error) {
          if (self._ending && (error.code === "ECONNRESET" || error.code === "EPIPE")) {
            return;
          }
          self.emit("error", error);
        };
        this.stream.on("error", reportStreamError);
        this.stream.on("close", function() {
          self.emit("end");
        });
        if (!this.ssl) {
          return this.attachListeners(this.stream);
        }
        if (this.sslNegotiation === "direct") {
          return this.stream.once("connect", function() {
            self.upgradeToSSL(host, reportStreamError);
          });
        }
        this.stream.once("data", function(buffer) {
          const responseCode = buffer.toString("utf8");
          switch (responseCode) {
            case "S":
              break;
            case "N":
              self.stream.end();
              return self.emit("error", new Error("The server does not support SSL connections"));
            default:
              self.stream.end();
              return self.emit("error", new Error("There was an error establishing an SSL connection"));
          }
          self.upgradeToSSL(host, reportStreamError);
        });
      }
      upgradeToSSL(host, reportStreamError) {
        const self = this;
        const options = {
          socket: self.stream
        };
        if (self.ssl !== true) {
          Object.assign(options, self.ssl);
          if ("key" in self.ssl) {
            options.key = self.ssl.key;
          }
        }
        if (self.sslNegotiation === "direct") {
          options.ALPNProtocols = ["postgresql"];
        }
        const net = require("net");
        if (net.isIP && net.isIP(host) === 0) {
          options.servername = host;
        }
        try {
          self.stream = stream.getSecureStream(options);
        } catch (err) {
          return self.emit("error", err);
        }
        self.attachListeners(self.stream);
        self.stream.on("error", reportStreamError);
        self.emit("sslconnect");
      }
      attachListeners(stream2) {
        parse2(stream2, (msg) => {
          const eventName = msg.name === "error" ? "errorMessage" : msg.name;
          if (this._emitMessage) {
            this.emit("message", msg);
          }
          this.emit(eventName, msg);
        });
      }
      requestSsl() {
        this.stream.write(serialize.requestSsl());
      }
      startup(config) {
        this.stream.write(serialize.startup(config));
      }
      cancel(processID, secretKey) {
        this._send(serialize.cancel(processID, secretKey));
      }
      password(password) {
        this._send(serialize.password(password));
      }
      sendSASLInitialResponseMessage(mechanism, initialResponse) {
        this._send(serialize.sendSASLInitialResponseMessage(mechanism, initialResponse));
      }
      sendSCRAMClientFinalMessage(additionalData) {
        this._send(serialize.sendSCRAMClientFinalMessage(additionalData));
      }
      _send(buffer) {
        if (!this.stream.writable) {
          return false;
        }
        return this.stream.write(buffer);
      }
      query(text) {
        this._send(serialize.query(text));
      }
      // send parse message
      parse(query2) {
        this._send(serialize.parse(query2));
      }
      // send bind message
      bind(config) {
        this._send(serialize.bind(config));
      }
      // send execute message
      execute(config) {
        this._send(serialize.execute(config));
      }
      flush() {
        if (this.stream.writable) {
          this.stream.write(flushBuffer);
        }
      }
      sync() {
        this._ending = true;
        this._send(syncBuffer);
      }
      ref() {
        this.stream.ref();
      }
      unref() {
        this.stream.unref();
      }
      end() {
        this._ending = true;
        if (!this._connecting || !this.stream.writable) {
          this.stream.end();
          return;
        }
        return this.stream.write(endBuffer, () => {
          this.stream.end();
        });
      }
      close(msg) {
        this._send(serialize.close(msg));
      }
      describe(msg) {
        this._send(serialize.describe(msg));
      }
      sendCopyFromChunk(chunk) {
        this._send(serialize.copyData(chunk));
      }
      endCopyFrom() {
        this._send(serialize.copyDone());
      }
      sendCopyFail(msg) {
        this._send(serialize.copyFail(msg));
      }
    };
    module2.exports = Connection2;
  }
});

// node_modules/split2/index.js
var require_split2 = __commonJS({
  "node_modules/split2/index.js"(exports2, module2) {
    "use strict";
    var { Transform } = require("stream");
    var { StringDecoder } = require("string_decoder");
    var kLast = Symbol("last");
    var kDecoder = Symbol("decoder");
    function transform(chunk, enc, cb) {
      let list;
      if (this.overflow) {
        const buf = this[kDecoder].write(chunk);
        list = buf.split(this.matcher);
        if (list.length === 1) return cb();
        list.shift();
        this.overflow = false;
      } else {
        this[kLast] += this[kDecoder].write(chunk);
        list = this[kLast].split(this.matcher);
      }
      this[kLast] = list.pop();
      for (let i = 0; i < list.length; i++) {
        try {
          push(this, this.mapper(list[i]));
        } catch (error) {
          return cb(error);
        }
      }
      this.overflow = this[kLast].length > this.maxLength;
      if (this.overflow && !this.skipOverflow) {
        cb(new Error("maximum buffer reached"));
        return;
      }
      cb();
    }
    function flush(cb) {
      this[kLast] += this[kDecoder].end();
      if (this[kLast]) {
        try {
          push(this, this.mapper(this[kLast]));
        } catch (error) {
          return cb(error);
        }
      }
      cb();
    }
    function push(self, val) {
      if (val !== void 0) {
        self.push(val);
      }
    }
    function noop(incoming) {
      return incoming;
    }
    function split(matcher, mapper, options) {
      matcher = matcher || /\r?\n/;
      mapper = mapper || noop;
      options = options || {};
      switch (arguments.length) {
        case 1:
          if (typeof matcher === "function") {
            mapper = matcher;
            matcher = /\r?\n/;
          } else if (typeof matcher === "object" && !(matcher instanceof RegExp) && !matcher[Symbol.split]) {
            options = matcher;
            matcher = /\r?\n/;
          }
          break;
        case 2:
          if (typeof matcher === "function") {
            options = mapper;
            mapper = matcher;
            matcher = /\r?\n/;
          } else if (typeof mapper === "object") {
            options = mapper;
            mapper = noop;
          }
      }
      options = Object.assign({}, options);
      options.autoDestroy = true;
      options.transform = transform;
      options.flush = flush;
      options.readableObjectMode = true;
      const stream = new Transform(options);
      stream[kLast] = "";
      stream[kDecoder] = new StringDecoder("utf8");
      stream.matcher = matcher;
      stream.mapper = mapper;
      stream.maxLength = options.maxLength;
      stream.skipOverflow = options.skipOverflow || false;
      stream.overflow = false;
      stream._destroy = function(err, cb) {
        this._writableState.errorEmitted = false;
        cb(err);
      };
      return stream;
    }
    module2.exports = split;
  }
});

// node_modules/pgpass/lib/helper.js
var require_helper = __commonJS({
  "node_modules/pgpass/lib/helper.js"(exports2, module2) {
    "use strict";
    var path = require("path");
    var Stream = require("stream").Stream;
    var split = require_split2();
    var util3 = require("util");
    var defaultPort = 5432;
    var isWin = process.platform === "win32";
    var warnStream = process.stderr;
    var S_IRWXG = 56;
    var S_IRWXO = 7;
    var S_IFMT = 61440;
    var S_IFREG = 32768;
    function isRegFile(mode) {
      return (mode & S_IFMT) == S_IFREG;
    }
    var fieldNames = ["host", "port", "database", "user", "password"];
    var nrOfFields = fieldNames.length;
    var passKey = fieldNames[nrOfFields - 1];
    function warn() {
      var isWritable = warnStream instanceof Stream && true === warnStream.writable;
      if (isWritable) {
        var args = Array.prototype.slice.call(arguments).concat("\n");
        warnStream.write(util3.format.apply(util3, args));
      }
    }
    Object.defineProperty(module2.exports, "isWin", {
      get: function() {
        return isWin;
      },
      set: function(val) {
        isWin = val;
      }
    });
    module2.exports.warnTo = function(stream) {
      var old = warnStream;
      warnStream = stream;
      return old;
    };
    module2.exports.getFileName = function(rawEnv) {
      var env = rawEnv || process.env;
      var file = env.PGPASSFILE || (isWin ? path.join(env.APPDATA || "./", "postgresql", "pgpass.conf") : path.join(env.HOME || "./", ".pgpass"));
      return file;
    };
    module2.exports.usePgPass = function(stats, fname) {
      if (Object.prototype.hasOwnProperty.call(process.env, "PGPASSWORD")) {
        return false;
      }
      if (isWin) {
        return true;
      }
      fname = fname || "<unkn>";
      if (!isRegFile(stats.mode)) {
        warn('WARNING: password file "%s" is not a plain file', fname);
        return false;
      }
      if (stats.mode & (S_IRWXG | S_IRWXO)) {
        warn('WARNING: password file "%s" has group or world access; permissions should be u=rw (0600) or less', fname);
        return false;
      }
      return true;
    };
    var matcher = module2.exports.match = function(connInfo, entry) {
      return fieldNames.slice(0, -1).reduce(function(prev, field, idx) {
        if (idx == 1) {
          if (Number(connInfo[field] || defaultPort) === Number(entry[field])) {
            return prev && true;
          }
        }
        return prev && (entry[field] === "*" || entry[field] === connInfo[field]);
      }, true);
    };
    module2.exports.getPassword = function(connInfo, stream, cb) {
      var pass;
      var lineStream = stream.pipe(split());
      function onLine(line) {
        var entry = parseLine(line);
        if (entry && isValidEntry(entry) && matcher(connInfo, entry)) {
          pass = entry[passKey];
          lineStream.end();
        }
      }
      var onEnd = function() {
        stream.destroy();
        cb(pass);
      };
      var onErr = function(err) {
        stream.destroy();
        warn("WARNING: error on reading file: %s", err);
        cb(void 0);
      };
      stream.on("error", onErr);
      lineStream.on("data", onLine).on("end", onEnd).on("error", onErr);
    };
    var parseLine = module2.exports.parseLine = function(line) {
      if (line.length < 11 || line.match(/^\s+#/)) {
        return null;
      }
      var curChar = "";
      var prevChar = "";
      var fieldIdx = 0;
      var startIdx = 0;
      var endIdx = 0;
      var obj = {};
      var isLastField = false;
      var addToObj = function(idx, i0, i1) {
        var field = line.substring(i0, i1);
        if (!Object.hasOwnProperty.call(process.env, "PGPASS_NO_DEESCAPE")) {
          field = field.replace(/\\([:\\])/g, "$1");
        }
        obj[fieldNames[idx]] = field;
      };
      for (var i = 0; i < line.length - 1; i += 1) {
        curChar = line.charAt(i + 1);
        prevChar = line.charAt(i);
        isLastField = fieldIdx == nrOfFields - 1;
        if (isLastField) {
          addToObj(fieldIdx, startIdx);
          break;
        }
        if (i >= 0 && curChar == ":" && prevChar !== "\\") {
          addToObj(fieldIdx, startIdx, i + 1);
          startIdx = i + 2;
          fieldIdx += 1;
        }
      }
      obj = Object.keys(obj).length === nrOfFields ? obj : null;
      return obj;
    };
    var isValidEntry = module2.exports.isValidEntry = function(entry) {
      var rules = {
        // host
        0: function(x) {
          return x.length > 0;
        },
        // port
        1: function(x) {
          if (x === "*") {
            return true;
          }
          x = Number(x);
          return isFinite(x) && x > 0 && x < 9007199254740992 && Math.floor(x) === x;
        },
        // database
        2: function(x) {
          return x.length > 0;
        },
        // username
        3: function(x) {
          return x.length > 0;
        },
        // password
        4: function(x) {
          return x.length > 0;
        }
      };
      for (var idx = 0; idx < fieldNames.length; idx += 1) {
        var rule = rules[idx];
        var value = entry[fieldNames[idx]] || "";
        var res = rule(value);
        if (!res) {
          return false;
        }
      }
      return true;
    };
  }
});

// node_modules/pgpass/lib/index.js
var require_lib = __commonJS({
  "node_modules/pgpass/lib/index.js"(exports2, module2) {
    "use strict";
    var path = require("path");
    var fs = require("fs");
    var helper = require_helper();
    module2.exports = function(connInfo, cb) {
      var file = helper.getFileName();
      fs.stat(file, function(err, stat) {
        if (err || !helper.usePgPass(stat, file)) {
          return cb(void 0);
        }
        var st = fs.createReadStream(file);
        helper.getPassword(connInfo, st, cb);
      });
    };
    module2.exports.warnTo = helper.warnTo;
  }
});

// node_modules/pg/lib/client.js
var require_client = __commonJS({
  "node_modules/pg/lib/client.js"(exports2, module2) {
    var EventEmitter = require("events").EventEmitter;
    var utils = require_utils();
    var nodeUtils = require("util");
    var sasl = require_sasl();
    var TypeOverrides2 = require_type_overrides();
    var ConnectionParameters = require_connection_parameters();
    var Query2 = require_query();
    var defaults2 = require_defaults();
    var Connection2 = require_connection();
    var crypto4 = require_utils2();
    var activeQueryDeprecationNotice = nodeUtils.deprecate(
      () => {
      },
      "Client.activeQuery is deprecated and will be removed in pg@9.0"
    );
    var queryQueueDeprecationNotice = nodeUtils.deprecate(
      () => {
      },
      "Client.queryQueue is deprecated and will be removed in pg@9.0."
    );
    var pgPassDeprecationNotice = nodeUtils.deprecate(
      () => {
      },
      "pgpass support is deprecated and will be removed in pg@9.0. You can provide an async function as the password property to the Client/Pool constructor that returns a password instead. Within this function you can call the pgpass module in your own code."
    );
    var byoPromiseDeprecationNotice = nodeUtils.deprecate(
      () => {
      },
      "Passing a custom Promise implementation to the Client/Pool constructor is deprecated and will be removed in pg@9.0."
    );
    var queryQueueLengthDeprecationNotice = nodeUtils.deprecate(
      () => {
      },
      "Calling client.query() when the client is already executing a query is deprecated and will be removed in pg@9.0. Use async/await or an external async flow control mechanism instead."
    );
    function coerceNumberOrDefault(value, defaultValue) {
      if (typeof value === "number") {
        return Number.isFinite(value) ? value : defaultValue;
      }
      if (typeof value === "string" && value.trim() !== "") {
        const n = Number(value);
        return Number.isFinite(n) ? n : defaultValue;
      }
      return defaultValue;
    }
    var Client2 = class extends EventEmitter {
      constructor(config) {
        super();
        this.connectionParameters = new ConnectionParameters(config);
        this.user = this.connectionParameters.user;
        this.database = this.connectionParameters.database;
        this.port = this.connectionParameters.port;
        this.host = this.connectionParameters.host;
        Object.defineProperty(this, "password", {
          configurable: true,
          enumerable: false,
          writable: true,
          value: this.connectionParameters.password
        });
        this.replication = this.connectionParameters.replication;
        const c = config || {};
        if (c.Promise) {
          byoPromiseDeprecationNotice();
        }
        this._Promise = c.Promise || global.Promise;
        this._types = new TypeOverrides2(c.types);
        this._ending = false;
        this._ended = false;
        this._connecting = false;
        this._connected = false;
        this._connectionError = false;
        this._queryable = true;
        this._activeQuery = null;
        this._txStatus = null;
        this.enableChannelBinding = Boolean(c.enableChannelBinding);
        this.scramMaxIterations = coerceNumberOrDefault(c.scramMaxIterations, sasl.DEFAULT_MAX_SCRAM_ITERATIONS);
        this.connection = c.connection || new Connection2({
          stream: c.stream,
          ssl: this.connectionParameters.ssl,
          sslNegotiation: this.connectionParameters.sslnegotiation,
          keepAlive: c.keepAlive || false,
          keepAliveInitialDelayMillis: c.keepAliveInitialDelayMillis || 0,
          encoding: this.connectionParameters.client_encoding || "utf8"
        });
        this._queryQueue = [];
        this.binary = c.binary || defaults2.binary;
        this.processID = null;
        this.secretKey = null;
        this.ssl = this.connectionParameters.ssl || false;
        this.sslNegotiation = this.connectionParameters.sslnegotiation || "postgres";
        if (this.ssl && this.ssl.key) {
          Object.defineProperty(this.ssl, "key", {
            enumerable: false
          });
        }
        this._connectionTimeoutMillis = c.connectionTimeoutMillis || 0;
      }
      get activeQuery() {
        activeQueryDeprecationNotice();
        return this._activeQuery;
      }
      set activeQuery(val) {
        activeQueryDeprecationNotice();
        this._activeQuery = val;
      }
      _getActiveQuery() {
        return this._activeQuery;
      }
      _errorAllQueries(err) {
        const enqueueError = (query2) => {
          process.nextTick(() => {
            query2.handleError(err, this.connection);
          });
        };
        const activeQuery = this._getActiveQuery();
        if (activeQuery) {
          enqueueError(activeQuery);
          this._activeQuery = null;
        }
        this._queryQueue.forEach(enqueueError);
        this._queryQueue.length = 0;
      }
      _connect(callback) {
        const self = this;
        const con = this.connection;
        this._connectionCallback = callback;
        if (this._connecting || this._connected) {
          const err = new Error("Client has already been connected. You cannot reuse a client.");
          process.nextTick(() => {
            callback(err);
          });
          return;
        }
        this._connecting = true;
        if (this._connectionTimeoutMillis > 0) {
          this.connectionTimeoutHandle = setTimeout(() => {
            con._ending = true;
            con.stream.destroy(new Error("timeout expired"));
          }, this._connectionTimeoutMillis);
          if (this.connectionTimeoutHandle.unref) {
            this.connectionTimeoutHandle.unref();
          }
        }
        if (this.host && this.host.indexOf("/") === 0) {
          con.connect(this.host + "/.s.PGSQL." + this.port);
        } else {
          con.connect(this.port, this.host);
        }
        con.on("connect", function() {
          if (self.ssl) {
            if (self.sslNegotiation !== "direct") {
              con.requestSsl();
            }
          } else {
            con.startup(self.getStartupConf());
          }
        });
        con.on("sslconnect", function() {
          con.startup(self.getStartupConf());
        });
        this._attachListeners(con);
        con.once("end", () => {
          const error = this._ending ? new Error("Connection terminated") : new Error("Connection terminated unexpectedly");
          clearTimeout(this.connectionTimeoutHandle);
          this._errorAllQueries(error);
          this._ended = true;
          if (!this._ending) {
            if (this._connecting && !this._connectionError) {
              if (this._connectionCallback) {
                this._connectionCallback(error);
              } else {
                this._handleErrorEvent(error);
              }
            } else if (!this._connectionError) {
              this._handleErrorEvent(error);
            }
          }
          process.nextTick(() => {
            this.emit("end");
          });
        });
      }
      connect(callback) {
        if (callback) {
          this._connect(callback);
          return;
        }
        return new this._Promise((resolve, reject) => {
          this._connect((error) => {
            if (error) {
              reject(error);
            } else {
              resolve(this);
            }
          });
        });
      }
      _attachListeners(con) {
        con.on("authenticationCleartextPassword", this._handleAuthCleartextPassword.bind(this));
        con.on("authenticationMD5Password", this._handleAuthMD5Password.bind(this));
        con.on("authenticationSASL", this._handleAuthSASL.bind(this));
        con.on("authenticationSASLContinue", this._handleAuthSASLContinue.bind(this));
        con.on("authenticationSASLFinal", this._handleAuthSASLFinal.bind(this));
        con.on("backendKeyData", this._handleBackendKeyData.bind(this));
        con.on("error", this._handleErrorEvent.bind(this));
        con.on("errorMessage", this._handleErrorMessage.bind(this));
        con.on("readyForQuery", this._handleReadyForQuery.bind(this));
        con.on("notice", this._handleNotice.bind(this));
        con.on("rowDescription", this._handleRowDescription.bind(this));
        con.on("dataRow", this._handleDataRow.bind(this));
        con.on("portalSuspended", this._handlePortalSuspended.bind(this));
        con.on("emptyQuery", this._handleEmptyQuery.bind(this));
        con.on("commandComplete", this._handleCommandComplete.bind(this));
        con.on("parseComplete", this._handleParseComplete.bind(this));
        con.on("copyInResponse", this._handleCopyInResponse.bind(this));
        con.on("copyData", this._handleCopyData.bind(this));
        con.on("notification", this._handleNotification.bind(this));
      }
      _getPassword(cb) {
        const con = this.connection;
        if (typeof this.password === "function") {
          this._Promise.resolve().then(() => this.password(this.connectionParameters)).then((pass) => {
            if (pass !== void 0) {
              if (typeof pass !== "string") {
                con.emit("error", new TypeError("Password must be a string"));
                return;
              }
              this.connectionParameters.password = this.password = pass;
            } else {
              this.connectionParameters.password = this.password = null;
            }
            cb();
          }).catch((err) => {
            con.emit("error", err);
          });
        } else if (this.password !== null) {
          cb();
        } else {
          try {
            const pgPass = require_lib();
            pgPass(this.connectionParameters, (pass) => {
              if (void 0 !== pass) {
                pgPassDeprecationNotice();
                this.connectionParameters.password = this.password = pass;
              }
              cb();
            });
          } catch (e) {
            this.emit("error", e);
          }
        }
      }
      _handleAuthCleartextPassword(msg) {
        this._getPassword(() => {
          this.connection.password(this.password);
        });
      }
      _handleAuthMD5Password(msg) {
        this._getPassword(async () => {
          try {
            const hashedPassword = await crypto4.postgresMd5PasswordHash(this.user, this.password, msg.salt);
            this.connection.password(hashedPassword);
          } catch (e) {
            this.emit("error", e);
          }
        });
      }
      _handleAuthSASL(msg) {
        this._getPassword(() => {
          try {
            this.saslSession = sasl.startSession(
              msg.mechanisms,
              this.enableChannelBinding && this.connection.stream,
              this.scramMaxIterations
            );
            this.connection.sendSASLInitialResponseMessage(this.saslSession.mechanism, this.saslSession.response);
          } catch (err) {
            this.connection.emit("error", err);
          }
        });
      }
      async _handleAuthSASLContinue(msg) {
        try {
          await sasl.continueSession(
            this.saslSession,
            this.password,
            msg.data,
            this.enableChannelBinding && this.connection.stream
          );
          this.connection.sendSCRAMClientFinalMessage(this.saslSession.response);
        } catch (err) {
          this.connection.emit("error", err);
        }
      }
      _handleAuthSASLFinal(msg) {
        try {
          sasl.finalizeSession(this.saslSession, msg.data);
          this.saslSession = null;
        } catch (err) {
          this.connection.emit("error", err);
        }
      }
      _handleBackendKeyData(msg) {
        this.processID = msg.processID;
        this.secretKey = msg.secretKey;
      }
      _handleReadyForQuery(msg) {
        if (this._connecting) {
          this._connecting = false;
          this._connected = true;
          clearTimeout(this.connectionTimeoutHandle);
          if (this._connectionCallback) {
            this._connectionCallback(null, this);
            this._connectionCallback = null;
          }
          this.emit("connect");
        }
        const activeQuery = this._getActiveQuery();
        this._activeQuery = null;
        this._txStatus = msg?.status ?? null;
        this.readyForQuery = true;
        if (activeQuery) {
          activeQuery.handleReadyForQuery(this.connection);
        }
        this._pulseQueryQueue();
      }
      // if we receive an error event or error message
      // during the connection process we handle it here
      _handleErrorWhileConnecting(err) {
        if (this._connectionError) {
          return;
        }
        this._connectionError = true;
        clearTimeout(this.connectionTimeoutHandle);
        if (this._connectionCallback) {
          return this._connectionCallback(err);
        }
        this.emit("error", err);
      }
      // if we're connected and we receive an error event from the connection
      // this means the socket is dead - do a hard abort of all queries and emit
      // the socket error on the client as well
      _handleErrorEvent(err) {
        if (this._connecting) {
          return this._handleErrorWhileConnecting(err);
        }
        this._queryable = false;
        this._errorAllQueries(err);
        this.emit("error", err);
      }
      // handle error messages from the postgres backend
      _handleErrorMessage(msg) {
        if (this._connecting) {
          return this._handleErrorWhileConnecting(msg);
        }
        const activeQuery = this._getActiveQuery();
        if (!activeQuery) {
          this._handleErrorEvent(msg);
          return;
        }
        this._activeQuery = null;
        activeQuery.handleError(msg, this.connection);
      }
      _handleRowDescription(msg) {
        const activeQuery = this._getActiveQuery();
        if (activeQuery == null) {
          const error = new Error("Received unexpected rowDescription message from backend.");
          this._handleErrorEvent(error);
          return;
        }
        activeQuery.handleRowDescription(msg);
      }
      _handleDataRow(msg) {
        const activeQuery = this._getActiveQuery();
        if (activeQuery == null) {
          const error = new Error("Received unexpected dataRow message from backend.");
          this._handleErrorEvent(error);
          return;
        }
        activeQuery.handleDataRow(msg);
      }
      _handlePortalSuspended(msg) {
        const activeQuery = this._getActiveQuery();
        if (activeQuery == null) {
          const error = new Error("Received unexpected portalSuspended message from backend.");
          this._handleErrorEvent(error);
          return;
        }
        activeQuery.handlePortalSuspended(this.connection);
      }
      _handleEmptyQuery(msg) {
        const activeQuery = this._getActiveQuery();
        if (activeQuery == null) {
          const error = new Error("Received unexpected emptyQuery message from backend.");
          this._handleErrorEvent(error);
          return;
        }
        activeQuery.handleEmptyQuery(this.connection);
      }
      _handleCommandComplete(msg) {
        const activeQuery = this._getActiveQuery();
        if (activeQuery == null) {
          const error = new Error("Received unexpected commandComplete message from backend.");
          this._handleErrorEvent(error);
          return;
        }
        activeQuery.handleCommandComplete(msg, this.connection);
      }
      _handleParseComplete() {
        const activeQuery = this._getActiveQuery();
        if (activeQuery == null) {
          const error = new Error("Received unexpected parseComplete message from backend.");
          this._handleErrorEvent(error);
          return;
        }
        if (activeQuery.name) {
          this.connection.parsedStatements[activeQuery.name] = activeQuery.text;
        }
      }
      _handleCopyInResponse(msg) {
        const activeQuery = this._getActiveQuery();
        if (activeQuery == null) {
          const error = new Error("Received unexpected copyInResponse message from backend.");
          this._handleErrorEvent(error);
          return;
        }
        activeQuery.handleCopyInResponse(this.connection);
      }
      _handleCopyData(msg) {
        const activeQuery = this._getActiveQuery();
        if (activeQuery == null) {
          const error = new Error("Received unexpected copyData message from backend.");
          this._handleErrorEvent(error);
          return;
        }
        activeQuery.handleCopyData(msg, this.connection);
      }
      _handleNotification(msg) {
        this.emit("notification", msg);
      }
      _handleNotice(msg) {
        this.emit("notice", msg);
      }
      getStartupConf() {
        const params = this.connectionParameters;
        const data = {
          user: params.user,
          database: params.database
        };
        const appName = params.application_name || params.fallback_application_name;
        if (appName) {
          data.application_name = appName;
        }
        if (params.replication) {
          data.replication = "" + params.replication;
        }
        if (params.statement_timeout) {
          data.statement_timeout = String(parseInt(params.statement_timeout, 10));
        }
        if (params.lock_timeout) {
          data.lock_timeout = String(parseInt(params.lock_timeout, 10));
        }
        if (params.idle_in_transaction_session_timeout) {
          data.idle_in_transaction_session_timeout = String(parseInt(params.idle_in_transaction_session_timeout, 10));
        }
        if (params.options) {
          data.options = params.options;
        }
        return data;
      }
      cancel(client, query2) {
        if (client.activeQuery === query2) {
          const con = this.connection;
          if (this.host && this.host.indexOf("/") === 0) {
            con.connect(this.host + "/.s.PGSQL." + this.port);
          } else {
            con.connect(this.port, this.host);
          }
          con.on("connect", function() {
            con.cancel(client.processID, client.secretKey);
          });
        } else if (client._queryQueue.indexOf(query2) !== -1) {
          client._queryQueue.splice(client._queryQueue.indexOf(query2), 1);
        }
      }
      setTypeParser(oid, format, parseFn) {
        return this._types.setTypeParser(oid, format, parseFn);
      }
      getTypeParser(oid, format) {
        return this._types.getTypeParser(oid, format);
      }
      // escapeIdentifier and escapeLiteral moved to utility functions & exported
      // on PG
      // re-exported here for backwards compatibility
      escapeIdentifier(str) {
        return utils.escapeIdentifier(str);
      }
      escapeLiteral(str) {
        return utils.escapeLiteral(str);
      }
      _pulseQueryQueue() {
        if (this.readyForQuery === true) {
          this._activeQuery = this._queryQueue.shift();
          const activeQuery = this._getActiveQuery();
          if (activeQuery) {
            this.readyForQuery = false;
            this.hasExecuted = true;
            const queryError = activeQuery.submit(this.connection);
            if (queryError) {
              process.nextTick(() => {
                activeQuery.handleError(queryError, this.connection);
                this.readyForQuery = true;
                this._pulseQueryQueue();
              });
            }
          } else if (this.hasExecuted) {
            this._activeQuery = null;
            this.emit("drain");
          }
        }
      }
      query(config, values, callback) {
        let query2;
        let result;
        if (config == null) {
          throw new TypeError("Client was passed a null or undefined query");
        }
        if (typeof config.submit === "function") {
          result = query2 = config;
          if (!query2.callback) {
            if (typeof values === "function") {
              query2.callback = values;
            } else if (callback) {
              query2.callback = callback;
            }
          }
        } else {
          query2 = new Query2(config, values, callback);
          if (!query2.callback) {
            result = new this._Promise((resolve, reject) => {
              query2.callback = (err, res) => err ? reject(err) : resolve(res);
            }).catch((err) => {
              Error.captureStackTrace(err);
              throw err;
            });
          } else if (typeof query2.callback !== "function") {
            throw new TypeError("callback is not a function");
          }
        }
        const readTimeout = config.query_timeout || this.connectionParameters.query_timeout;
        if (readTimeout) {
          const queryCallback = query2.callback || (() => {
          });
          const readTimeoutTimer = setTimeout(() => {
            const error = new Error("Query read timeout");
            process.nextTick(() => {
              query2.handleError(error, this.connection);
            });
            queryCallback(error);
            query2.callback = () => {
            };
            const index = this._queryQueue.indexOf(query2);
            if (index > -1) {
              this._queryQueue.splice(index, 1);
            }
            this._pulseQueryQueue();
          }, readTimeout);
          query2.callback = (err, res) => {
            clearTimeout(readTimeoutTimer);
            queryCallback(err, res);
          };
        }
        if (this.binary && !query2.binary) {
          query2.binary = true;
        }
        if (query2._result && !query2._result._types) {
          query2._result._types = this._types;
        }
        if (!this._queryable) {
          process.nextTick(() => {
            query2.handleError(new Error("Client has encountered a connection error and is not queryable"), this.connection);
          });
          return result;
        }
        if (this._ending) {
          process.nextTick(() => {
            query2.handleError(new Error("Client was closed and is not queryable"), this.connection);
          });
          return result;
        }
        if (this._queryQueue.length > 0) {
          queryQueueLengthDeprecationNotice();
        }
        this._queryQueue.push(query2);
        this._pulseQueryQueue();
        return result;
      }
      ref() {
        this.connection.ref();
      }
      unref() {
        this.connection.unref();
      }
      getTransactionStatus() {
        return this._txStatus;
      }
      end(cb) {
        this._ending = true;
        if (!this.connection._connecting || this._ended) {
          if (cb) {
            cb();
            return;
          } else {
            return this._Promise.resolve();
          }
        }
        if (this._getActiveQuery() || !this._queryable) {
          this.connection.stream.destroy();
        } else {
          this.connection.end();
        }
        if (cb) {
          this.connection.once("end", cb);
        } else {
          return new this._Promise((resolve) => {
            this.connection.once("end", resolve);
          });
        }
      }
      get queryQueue() {
        queryQueueDeprecationNotice();
        return this._queryQueue;
      }
    };
    Client2.Query = Query2;
    module2.exports = Client2;
  }
});

// node_modules/pg-pool/index.js
var require_pg_pool = __commonJS({
  "node_modules/pg-pool/index.js"(exports2, module2) {
    "use strict";
    var EventEmitter = require("events").EventEmitter;
    var NOOP = function() {
    };
    var removeWhere = (list, predicate) => {
      const i = list.findIndex(predicate);
      return i === -1 ? void 0 : list.splice(i, 1)[0];
    };
    var IdleItem = class {
      constructor(client, idleListener, timeoutId) {
        this.client = client;
        this.idleListener = idleListener;
        this.timeoutId = timeoutId;
      }
    };
    var PendingItem = class {
      constructor(callback) {
        this.callback = callback;
      }
    };
    function throwOnDoubleRelease() {
      throw new Error("Release called on client which has already been released to the pool.");
    }
    function promisify3(Promise2, callback) {
      if (callback) {
        return { callback, result: void 0 };
      }
      let rej;
      let res;
      const cb = function(err, client) {
        err ? rej(err) : res(client);
      };
      const result = new Promise2(function(resolve, reject) {
        res = resolve;
        rej = reject;
      }).catch((err) => {
        Error.captureStackTrace(err);
        throw err;
      });
      return { callback: cb, result };
    }
    function makeIdleListener(pool, client) {
      return function idleListener(err) {
        err.client = client;
        client.removeListener("error", idleListener);
        client.on("error", () => {
          pool.log("additional client error after disconnection due to error", err);
        });
        pool._remove(client);
        pool.emit("error", err, client);
      };
    }
    var Pool2 = class extends EventEmitter {
      constructor(options, Client2) {
        super();
        this.options = Object.assign({}, options);
        if (options != null && "password" in options) {
          Object.defineProperty(this.options, "password", {
            configurable: true,
            enumerable: false,
            writable: true,
            value: options.password
          });
        }
        if (options != null && options.ssl && options.ssl.key) {
          Object.defineProperty(this.options.ssl, "key", {
            enumerable: false
          });
        }
        this.options.max = this.options.max || this.options.poolSize || 10;
        this.options.min = this.options.min || 0;
        this.options.maxUses = this.options.maxUses || Infinity;
        this.options.allowExitOnIdle = this.options.allowExitOnIdle || false;
        this.options.maxLifetimeSeconds = this.options.maxLifetimeSeconds || 0;
        this.log = this.options.log || function() {
        };
        this.Client = this.options.Client || Client2 || require_lib2().Client;
        this.Promise = this.options.Promise || global.Promise;
        if (typeof this.options.idleTimeoutMillis === "undefined") {
          this.options.idleTimeoutMillis = 1e4;
        }
        this._clients = [];
        this._idle = [];
        this._expired = /* @__PURE__ */ new WeakSet();
        this._pendingQueue = [];
        this._endCallback = void 0;
        this.ending = false;
        this.ended = false;
      }
      _promiseTry(f) {
        const Promise2 = this.Promise;
        if (typeof Promise2.try === "function") {
          return Promise2.try(f);
        }
        return new Promise2((resolve) => resolve(f()));
      }
      _isFull() {
        return this._clients.length >= this.options.max;
      }
      _isAboveMin() {
        return this._clients.length > this.options.min;
      }
      _pulseQueue() {
        this.log("pulse queue");
        if (this.ended) {
          this.log("pulse queue ended");
          return;
        }
        if (this.ending) {
          this.log("pulse queue on ending");
          if (this._idle.length) {
            this._idle.slice().map((item) => {
              this._remove(item.client);
            });
          }
          if (!this._clients.length) {
            this.ended = true;
            this._endCallback();
          }
          return;
        }
        if (!this._pendingQueue.length) {
          this.log("no queued requests");
          return;
        }
        if (!this._idle.length && this._isFull()) {
          return;
        }
        const pendingItem = this._pendingQueue.shift();
        if (this._idle.length) {
          const idleItem = this._idle.pop();
          clearTimeout(idleItem.timeoutId);
          const client = idleItem.client;
          client.ref && client.ref();
          const idleListener = idleItem.idleListener;
          return this._acquireClient(client, pendingItem, idleListener, false);
        }
        if (!this._isFull()) {
          return this.newClient(pendingItem);
        }
        throw new Error("unexpected condition");
      }
      _remove(client, callback) {
        const removed = removeWhere(this._idle, (item) => item.client === client);
        if (removed !== void 0) {
          clearTimeout(removed.timeoutId);
        }
        this._clients = this._clients.filter((c) => c !== client);
        const context = this;
        client.end(() => {
          context.emit("remove", client);
          if (typeof callback === "function") {
            callback();
          }
        });
      }
      connect(cb) {
        if (this.ending) {
          const err = new Error("Cannot use a pool after calling end on the pool");
          return cb ? cb(err) : this.Promise.reject(err);
        }
        const response = promisify3(this.Promise, cb);
        const result = response.result;
        if (this._isFull() || this._idle.length) {
          if (this._idle.length) {
            process.nextTick(() => this._pulseQueue());
          }
          if (!this.options.connectionTimeoutMillis) {
            this._pendingQueue.push(new PendingItem(response.callback));
            return result;
          }
          const queueCallback = (err, res, done) => {
            clearTimeout(tid);
            response.callback(err, res, done);
          };
          const pendingItem = new PendingItem(queueCallback);
          const tid = setTimeout(() => {
            removeWhere(this._pendingQueue, (i) => i.callback === queueCallback);
            pendingItem.timedOut = true;
            response.callback(new Error("timeout exceeded when trying to connect"));
          }, this.options.connectionTimeoutMillis);
          if (tid.unref) {
            tid.unref();
          }
          this._pendingQueue.push(pendingItem);
          return result;
        }
        this.newClient(new PendingItem(response.callback));
        return result;
      }
      newClient(pendingItem) {
        const client = new this.Client(this.options);
        this._clients.push(client);
        const idleListener = makeIdleListener(this, client);
        this.log("checking client timeout");
        let tid;
        let timeoutHit = false;
        if (this.options.connectionTimeoutMillis) {
          tid = setTimeout(() => {
            if (client.connection) {
              this.log("ending client due to timeout");
              timeoutHit = true;
              client.connection.stream.destroy();
            } else if (!client.isConnected()) {
              this.log("ending client due to timeout");
              timeoutHit = true;
              client.end();
            }
          }, this.options.connectionTimeoutMillis);
        }
        this.log("connecting new client");
        client.connect((err) => {
          if (tid) {
            clearTimeout(tid);
          }
          client.on("error", idleListener);
          if (err) {
            this.log("client failed to connect", err);
            this._clients = this._clients.filter((c) => c !== client);
            if (timeoutHit) {
              err = new Error("Connection terminated due to connection timeout", { cause: err });
            }
            this._pulseQueue();
            if (!pendingItem.timedOut) {
              pendingItem.callback(err, void 0, NOOP);
            }
          } else {
            this.log("new client connected");
            if (this.options.onConnect) {
              this._promiseTry(() => this.options.onConnect(client)).then(
                () => {
                  this._afterConnect(client, pendingItem, idleListener);
                },
                (hookErr) => {
                  this._clients = this._clients.filter((c) => c !== client);
                  client.end(() => {
                    this._pulseQueue();
                    if (!pendingItem.timedOut) {
                      pendingItem.callback(hookErr, void 0, NOOP);
                    }
                  });
                }
              );
              return;
            }
            return this._afterConnect(client, pendingItem, idleListener);
          }
        });
      }
      _afterConnect(client, pendingItem, idleListener) {
        if (this.options.maxLifetimeSeconds !== 0) {
          const maxLifetimeTimeout = setTimeout(() => {
            this.log("ending client due to expired lifetime");
            this._expired.add(client);
            const idleIndex = this._idle.findIndex((idleItem) => idleItem.client === client);
            if (idleIndex !== -1) {
              this._acquireClient(
                client,
                new PendingItem((err, client2, clientRelease) => clientRelease()),
                idleListener,
                false
              );
            }
          }, this.options.maxLifetimeSeconds * 1e3);
          maxLifetimeTimeout.unref();
          client.once("end", () => clearTimeout(maxLifetimeTimeout));
        }
        return this._acquireClient(client, pendingItem, idleListener, true);
      }
      // acquire a client for a pending work item
      _acquireClient(client, pendingItem, idleListener, isNew) {
        if (isNew) {
          this.emit("connect", client);
        }
        this.emit("acquire", client);
        client.release = this._releaseOnce(client, idleListener);
        client.removeListener("error", idleListener);
        if (!pendingItem.timedOut) {
          if (isNew && this.options.verify) {
            this.options.verify(client, (err) => {
              if (err) {
                client.release(err);
                return pendingItem.callback(err, void 0, NOOP);
              }
              pendingItem.callback(void 0, client, client.release);
            });
          } else {
            pendingItem.callback(void 0, client, client.release);
          }
        } else {
          if (isNew && this.options.verify) {
            this.options.verify(client, client.release);
          } else {
            client.release();
          }
        }
      }
      // returns a function that wraps _release and throws if called more than once
      _releaseOnce(client, idleListener) {
        let released = false;
        return (err) => {
          if (released) {
            throwOnDoubleRelease();
          }
          released = true;
          this._release(client, idleListener, err);
        };
      }
      // release a client back to the poll, include an error
      // to remove it from the pool
      _release(client, idleListener, err) {
        client.on("error", idleListener);
        client._poolUseCount = (client._poolUseCount || 0) + 1;
        this.emit("release", err, client);
        if (err || this.ending || !client._queryable || client._ending || client._poolUseCount >= this.options.maxUses) {
          if (client._poolUseCount >= this.options.maxUses) {
            this.log("remove expended client");
          }
          return this._remove(client, this._pulseQueue.bind(this));
        }
        const isExpired = this._expired.has(client);
        if (isExpired) {
          this.log("remove expired client");
          this._expired.delete(client);
          return this._remove(client, this._pulseQueue.bind(this));
        }
        let tid;
        if (this.options.idleTimeoutMillis && this._isAboveMin()) {
          tid = setTimeout(() => {
            if (this._isAboveMin()) {
              this.log("remove idle client");
              this._remove(client, this._pulseQueue.bind(this));
            }
          }, this.options.idleTimeoutMillis);
          if (this.options.allowExitOnIdle) {
            tid.unref();
          }
        }
        if (this.options.allowExitOnIdle) {
          client.unref();
        }
        this._idle.push(new IdleItem(client, idleListener, tid));
        this._pulseQueue();
      }
      query(text, values, cb) {
        if (typeof text === "function") {
          const response2 = promisify3(this.Promise, text);
          setImmediate(function() {
            return response2.callback(new Error("Passing a function as the first parameter to pool.query is not supported"));
          });
          return response2.result;
        }
        if (typeof values === "function") {
          cb = values;
          values = void 0;
        }
        const response = promisify3(this.Promise, cb);
        cb = response.callback;
        this.connect((err, client) => {
          if (err) {
            return cb(err);
          }
          let clientReleased = false;
          const onError = (err2) => {
            if (clientReleased) {
              return;
            }
            clientReleased = true;
            client.release(err2);
            cb(err2);
          };
          client.once("error", onError);
          this.log("dispatching query");
          try {
            client.query(text, values, (err2, res) => {
              this.log("query dispatched");
              client.removeListener("error", onError);
              if (clientReleased) {
                return;
              }
              clientReleased = true;
              client.release(err2);
              if (err2) {
                return cb(err2);
              }
              return cb(void 0, res);
            });
          } catch (err2) {
            client.release(err2);
            return cb(err2);
          }
        });
        return response.result;
      }
      end(cb) {
        this.log("ending");
        if (this.ending) {
          const err = new Error("Called end on pool more than once");
          return cb ? cb(err) : this.Promise.reject(err);
        }
        this.ending = true;
        const promised = promisify3(this.Promise, cb);
        this._endCallback = promised.callback;
        this._pulseQueue();
        return promised.result;
      }
      get waitingCount() {
        return this._pendingQueue.length;
      }
      get idleCount() {
        return this._idle.length;
      }
      get expiredCount() {
        return this._clients.reduce((acc, client) => acc + (this._expired.has(client) ? 1 : 0), 0);
      }
      get totalCount() {
        return this._clients.length;
      }
    };
    module2.exports = Pool2;
  }
});

// node_modules/pg/lib/native/query.js
var require_query2 = __commonJS({
  "node_modules/pg/lib/native/query.js"(exports2, module2) {
    "use strict";
    var EventEmitter = require("events").EventEmitter;
    var util3 = require("util");
    var utils = require_utils();
    var NativeQuery = module2.exports = function(config, values, callback) {
      EventEmitter.call(this);
      config = utils.normalizeQueryConfig(config, values, callback);
      this.text = config.text;
      this.values = config.values;
      this.name = config.name;
      this.queryMode = config.queryMode;
      this.callback = config.callback;
      this.state = "new";
      this._arrayMode = config.rowMode === "array";
      this._emitRowEvents = false;
      this.on(
        "newListener",
        function(event) {
          if (event === "row") this._emitRowEvents = true;
        }.bind(this)
      );
    };
    util3.inherits(NativeQuery, EventEmitter);
    var errorFieldMap = {
      sqlState: "code",
      statementPosition: "position",
      messagePrimary: "message",
      context: "where",
      schemaName: "schema",
      tableName: "table",
      columnName: "column",
      dataTypeName: "dataType",
      constraintName: "constraint",
      sourceFile: "file",
      sourceLine: "line",
      sourceFunction: "routine"
    };
    NativeQuery.prototype.handleError = function(err) {
      const fields = this.native.pq.resultErrorFields();
      if (fields) {
        for (const key in fields) {
          const normalizedFieldName = errorFieldMap[key] || key;
          err[normalizedFieldName] = fields[key];
        }
      }
      if (this.callback) {
        this.callback(err);
      } else {
        this.emit("error", err);
      }
      this.state = "error";
    };
    NativeQuery.prototype.then = function(onSuccess, onFailure) {
      return this._getPromise().then(onSuccess, onFailure);
    };
    NativeQuery.prototype.catch = function(callback) {
      return this._getPromise().catch(callback);
    };
    NativeQuery.prototype._getPromise = function() {
      if (this._promise) return this._promise;
      this._promise = new Promise(
        function(resolve, reject) {
          this._once("end", resolve);
          this._once("error", reject);
        }.bind(this)
      );
      return this._promise;
    };
    NativeQuery.prototype.submit = function(client) {
      this.state = "running";
      const self = this;
      this.native = client.native;
      client.native.arrayMode = this._arrayMode;
      let after = function(err, rows, results) {
        client.native.arrayMode = false;
        setImmediate(function() {
          self.emit("_done");
        });
        if (err) {
          return self.handleError(err);
        }
        if (self._emitRowEvents) {
          if (results.length > 1) {
            rows.forEach((rowOfRows, i) => {
              rowOfRows.forEach((row) => {
                self.emit("row", row, results[i]);
              });
            });
          } else {
            rows.forEach(function(row) {
              self.emit("row", row, results);
            });
          }
        }
        self.state = "end";
        self.emit("end", results);
        if (self.callback) {
          self.callback(null, results);
        }
      };
      if (process.domain) {
        after = process.domain.bind(after);
      }
      if (this.name) {
        if (this.name.length > 63) {
          console.error("Warning! Postgres only supports 63 characters for query names.");
          console.error("You supplied %s (%s)", this.name, this.name.length);
          console.error("This can cause conflicts and silent errors executing queries");
        }
        const values = (this.values || []).map(utils.prepareValue);
        if (client.namedQueries[this.name]) {
          if (this.text && client.namedQueries[this.name] !== this.text) {
            const err = new Error(`Prepared statements must be unique - '${this.name}' was used for a different statement`);
            return after(err);
          }
          return client.native.execute(this.name, values, after);
        }
        return client.native.prepare(this.name, this.text, values.length, function(err) {
          if (err) return after(err);
          client.namedQueries[self.name] = self.text;
          return self.native.execute(self.name, values, after);
        });
      } else if (this.values) {
        if (!Array.isArray(this.values)) {
          const err = new Error("Query values must be an array");
          return after(err);
        }
        const vals = this.values.map(utils.prepareValue);
        client.native.query(this.text, vals, after);
      } else if (this.queryMode === "extended") {
        client.native.query(this.text, [], after);
      } else {
        client.native.query(this.text, after);
      }
    };
  }
});

// node_modules/pg/lib/native/client.js
var require_client2 = __commonJS({
  "node_modules/pg/lib/native/client.js"(exports2, module2) {
    var nodeUtils = require("util");
    var Native;
    try {
      Native = require("pg-native");
    } catch (e) {
      throw e;
    }
    var TypeOverrides2 = require_type_overrides();
    var EventEmitter = require("events").EventEmitter;
    var util3 = require("util");
    var ConnectionParameters = require_connection_parameters();
    var NativeQuery = require_query2();
    var queryQueueLengthDeprecationNotice = nodeUtils.deprecate(
      () => {
      },
      "Calling client.query() when the client is already executing a query is deprecated and will be removed in pg@9.0. Use async/await or an external async flow control mechanism instead."
    );
    var Client2 = module2.exports = function(config) {
      EventEmitter.call(this);
      config = config || {};
      this._Promise = config.Promise || global.Promise;
      this._types = new TypeOverrides2(config.types);
      this.native = new Native({
        types: this._types
      });
      this._queryQueue = [];
      this._ending = false;
      this._connecting = false;
      this._connected = false;
      this._queryable = true;
      const cp = this.connectionParameters = new ConnectionParameters(config);
      if (config.nativeConnectionString) cp.nativeConnectionString = config.nativeConnectionString;
      this.user = cp.user;
      Object.defineProperty(this, "password", {
        configurable: true,
        enumerable: false,
        writable: true,
        value: cp.password
      });
      this.database = cp.database;
      this.host = cp.host;
      this.port = cp.port;
      this.namedQueries = {};
    };
    Client2.Query = NativeQuery;
    util3.inherits(Client2, EventEmitter);
    Client2.prototype._errorAllQueries = function(err) {
      const enqueueError = (query2) => {
        process.nextTick(() => {
          query2.native = this.native;
          query2.handleError(err);
        });
      };
      if (this._hasActiveQuery()) {
        enqueueError(this._activeQuery);
        this._activeQuery = null;
      }
      this._queryQueue.forEach(enqueueError);
      this._queryQueue.length = 0;
    };
    Client2.prototype._connect = function(cb) {
      const self = this;
      if (this._connecting) {
        process.nextTick(() => cb(new Error("Client has already been connected. You cannot reuse a client.")));
        return;
      }
      this._connecting = true;
      this.connectionParameters.getLibpqConnectionString(function(err, conString) {
        if (self.connectionParameters.nativeConnectionString) conString = self.connectionParameters.nativeConnectionString;
        if (err) return cb(err);
        self.native.connect(conString, function(err2) {
          if (err2) {
            self.native.end();
            return cb(err2);
          }
          self._connected = true;
          self.native.on("error", function(err3) {
            self._queryable = false;
            self._errorAllQueries(err3);
            self.emit("error", err3);
          });
          self.native.on("notification", function(msg) {
            self.emit("notification", {
              channel: msg.relname,
              payload: msg.extra
            });
          });
          self.emit("connect");
          self._pulseQueryQueue(true);
          cb(null, this);
        });
      });
    };
    Client2.prototype.connect = function(callback) {
      if (callback) {
        this._connect(callback);
        return;
      }
      return new this._Promise((resolve, reject) => {
        this._connect((error) => {
          if (error) {
            reject(error);
          } else {
            resolve(this);
          }
        });
      });
    };
    Client2.prototype.query = function(config, values, callback) {
      let query2;
      let result;
      let readTimeout;
      let readTimeoutTimer;
      let queryCallback;
      if (config === null || config === void 0) {
        throw new TypeError("Client was passed a null or undefined query");
      } else if (typeof config.submit === "function") {
        readTimeout = config.query_timeout || this.connectionParameters.query_timeout;
        result = query2 = config;
        if (typeof values === "function") {
          config.callback = values;
        }
      } else {
        readTimeout = config.query_timeout || this.connectionParameters.query_timeout;
        query2 = new NativeQuery(config, values, callback);
        if (!query2.callback) {
          let resolveOut, rejectOut;
          result = new this._Promise((resolve, reject) => {
            resolveOut = resolve;
            rejectOut = reject;
          }).catch((err) => {
            Error.captureStackTrace(err);
            throw err;
          });
          query2.callback = (err, res) => err ? rejectOut(err) : resolveOut(res);
        }
      }
      if (readTimeout) {
        queryCallback = query2.callback || (() => {
        });
        readTimeoutTimer = setTimeout(() => {
          const error = new Error("Query read timeout");
          process.nextTick(() => {
            query2.handleError(error, this.connection);
          });
          queryCallback(error);
          query2.callback = () => {
          };
          const index = this._queryQueue.indexOf(query2);
          if (index > -1) {
            this._queryQueue.splice(index, 1);
          }
          this._pulseQueryQueue();
        }, readTimeout);
        query2.callback = (err, res) => {
          clearTimeout(readTimeoutTimer);
          queryCallback(err, res);
        };
      }
      if (!this._queryable) {
        query2.native = this.native;
        process.nextTick(() => {
          query2.handleError(new Error("Client has encountered a connection error and is not queryable"));
        });
        return result;
      }
      if (this._ending) {
        query2.native = this.native;
        process.nextTick(() => {
          query2.handleError(new Error("Client was closed and is not queryable"));
        });
        return result;
      }
      if (this._queryQueue.length > 0) {
        queryQueueLengthDeprecationNotice();
      }
      this._queryQueue.push(query2);
      this._pulseQueryQueue();
      return result;
    };
    Client2.prototype.end = function(cb) {
      const self = this;
      this._ending = true;
      if (this._connecting && !this._connected) {
        this.once("connect", () => {
          this.end(() => {
          });
        });
      }
      let result;
      if (!cb) {
        result = new this._Promise(function(resolve, reject) {
          cb = (err) => err ? reject(err) : resolve();
        });
      }
      this.native.end(function() {
        self._connected = false;
        self._errorAllQueries(new Error("Connection terminated"));
        process.nextTick(() => {
          self.emit("end");
          if (cb) cb();
        });
      });
      return result;
    };
    Client2.prototype._hasActiveQuery = function() {
      return this._activeQuery && this._activeQuery.state !== "error" && this._activeQuery.state !== "end";
    };
    Client2.prototype._pulseQueryQueue = function(initialConnection) {
      if (!this._connected) {
        return;
      }
      if (this._hasActiveQuery()) {
        return;
      }
      const query2 = this._queryQueue.shift();
      if (!query2) {
        if (!initialConnection) {
          this.emit("drain");
        }
        return;
      }
      this._activeQuery = query2;
      query2.submit(this);
      const self = this;
      query2.once("_done", function() {
        self._pulseQueryQueue();
      });
    };
    Client2.prototype.cancel = function(query2) {
      if (this._activeQuery === query2) {
        this.native.cancel(function() {
        });
      } else if (this._queryQueue.indexOf(query2) !== -1) {
        this._queryQueue.splice(this._queryQueue.indexOf(query2), 1);
      }
    };
    Client2.prototype.ref = function() {
    };
    Client2.prototype.unref = function() {
    };
    Client2.prototype.setTypeParser = function(oid, format, parseFn) {
      return this._types.setTypeParser(oid, format, parseFn);
    };
    Client2.prototype.getTypeParser = function(oid, format) {
      return this._types.getTypeParser(oid, format);
    };
    Client2.prototype.isConnected = function() {
      return this._connected;
    };
    Client2.prototype.getTransactionStatus = function() {
      return this.native.getTransactionStatus();
    };
  }
});

// node_modules/pg/lib/native/index.js
var require_native = __commonJS({
  "node_modules/pg/lib/native/index.js"(exports2, module2) {
    "use strict";
    module2.exports = require_client2();
  }
});

// node_modules/pg/lib/index.js
var require_lib2 = __commonJS({
  "node_modules/pg/lib/index.js"(exports2, module2) {
    "use strict";
    var Client2 = require_client();
    var defaults2 = require_defaults();
    var Connection2 = require_connection();
    var Result2 = require_result();
    var utils = require_utils();
    var Pool2 = require_pg_pool();
    var TypeOverrides2 = require_type_overrides();
    var { DatabaseError: DatabaseError2 } = require_dist();
    var { escapeIdentifier: escapeIdentifier2, escapeLiteral: escapeLiteral2 } = require_utils();
    var poolFactory = (Client3) => {
      return class BoundPool extends Pool2 {
        constructor(options) {
          super(options, Client3);
        }
      };
    };
    var PG = function(clientConstructor2) {
      this.defaults = defaults2;
      this.Client = clientConstructor2;
      this.Query = this.Client.Query;
      this.Pool = poolFactory(this.Client);
      this._pools = [];
      this.Connection = Connection2;
      this.types = require_pg_types();
      this.DatabaseError = DatabaseError2;
      this.TypeOverrides = TypeOverrides2;
      this.escapeIdentifier = escapeIdentifier2;
      this.escapeLiteral = escapeLiteral2;
      this.Result = Result2;
      this.utils = utils;
    };
    var clientConstructor = Client2;
    var forceNative = false;
    try {
      forceNative = !!process.env.NODE_PG_FORCE_NATIVE;
    } catch {
    }
    if (forceNative) {
      clientConstructor = require_native();
    }
    module2.exports = new PG(clientConstructor);
    Object.defineProperty(module2.exports, "native", {
      configurable: true,
      enumerable: false,
      get() {
        let native = null;
        try {
          native = new PG(require_native());
        } catch (err) {
          if (err.code !== "MODULE_NOT_FOUND") {
            throw err;
          }
        }
        Object.defineProperty(module2.exports, "native", {
          value: native
        });
        return native;
      }
    });
  }
});

// api/src/functions/cases.ts
var import_functions = require("@azure/functions");

// packages/domain/dist/contracts/eva-export.js
var EVA_FIELD_ORDER = [
  { key: "workProvider", payloadKey: "work_provider", label: "Work Provider", required: true },
  { key: "vehicleModel", payloadKey: "vehicle_model", label: "Vehicle Model", required: true },
  { key: "claimantName", payloadKey: "claimant_name", label: "Claimant Name", required: true },
  { key: "claimantTelephone", payloadKey: "claimant_telephone", label: "Claimant Telephone", required: false },
  { key: "claimantEmail", payloadKey: "claimant_email", label: "Claimant Email Address", required: false },
  { key: "dateOfLoss", payloadKey: "date_of_loss", label: "Date of Incident", required: true },
  { key: "dateOfInstruction", payloadKey: "date_of_instruction", label: "Date of Instruction", required: true },
  { key: "accidentCircumstances", payloadKey: "accident_circumstances", label: "Accident Circumstances", required: true },
  { key: "inspectionAddress", payloadKey: "inspection_address", label: "Inspection Address", required: true },
  { key: "vatStatus", payloadKey: "vat_status", label: "VAT Status", required: false },
  { key: "mileage", payloadKey: "mileage", label: "Mileage", required: false },
  { key: "mileageUnit", payloadKey: "mileage_unit", label: "Mileage Unit", required: false }
];
var EVA_PAYLOAD_KEYS = EVA_FIELD_ORDER.map((d) => d.payloadKey);

// packages/domain/dist/contracts/image-rules.js
var MIN_ACCEPTED_IMAGES = 2;
function isAcceptedEvaImage(e) {
  return e.kind === "image" && e.acceptedForEva && e.excluded !== true;
}
function acceptedEvaImages(evidence) {
  return evidence.filter(isAcceptedEvaImage);
}
function evaluateEvaImageRules(evidence) {
  const accepted = acceptedEvaImages(evidence);
  const acceptedCount = accepted.length;
  const hasOverview = accepted.some((e) => e.imageRole === "overview" && e.registrationVisible);
  const hasDamageCloseup = accepted.some((e) => e.imageRole === "damage_closeup");
  const failures = [];
  if (acceptedCount < MIN_ACCEPTED_IMAGES) {
    failures.push({
      code: "min_count",
      message: `At least ${MIN_ACCEPTED_IMAGES} accepted EVA images are required (have ${acceptedCount}).`
    });
  }
  if (!hasOverview) {
    failures.push({
      code: "missing_overview",
      message: "At least one overview image with a visible registration is required."
    });
  }
  if (!hasDamageCloseup) {
    failures.push({
      code: "missing_damage_closeup",
      message: "At least one main-damage close-up image is required."
    });
  }
  return {
    ok: failures.length === 0,
    acceptedCount,
    hasOverview,
    hasDamageCloseup,
    failures
  };
}
function validateEvaImageRules(evidence) {
  return evaluateEvaImageRules(evidence).failures;
}

// packages/domain/dist/contracts/case-status.js
var TERMINAL_STATUSES = [
  "eva_submitted",
  "box_synced",
  "error",
  "removed"
];
var TERMINAL_SET = new Set(TERMINAL_STATUSES);
function isTerminalStatus(status) {
  return TERMINAL_SET.has(status);
}
var REQUIRED_FIELD_KEYS = EVA_FIELD_ORDER.filter((d) => d.required).map((d) => d.key);
function missingRequiredFieldKeys(fields) {
  return REQUIRED_FIELD_KEYS.filter((key) => {
    const field = fields[key];
    return !field || field.value.trim().length === 0;
  });
}
function instructionCountOf(input) {
  if (typeof input.instructionCount === "number")
    return input.instructionCount;
  return input.evidence.filter((e) => e.kind === "instruction").length;
}
function hasIdentityOf(input) {
  if (typeof input.hasIdentity === "boolean")
    return input.hasIdentity;
  const wp = input.evaFields.workProvider?.value?.trim() ?? "";
  const cn = input.evaFields.claimantName?.value?.trim() ?? "";
  return wp.length > 0 || cn.length > 0;
}
function statusForReviewCase(input) {
  if (isTerminalStatus(input.status))
    return input.status;
  const fieldsValid = missingRequiredFieldKeys(input.evaFields).length === 0;
  const imagesValid = validateEvaImageRules(input.evidence).length === 0;
  if (fieldsValid && imagesValid)
    return "ready_for_eva";
  if (fieldsValid && !imagesValid)
    return "missing_images";
  if (!fieldsValid && imagesValid)
    return "missing_required_fields";
  const acceptedImages = acceptedEvaImages(input.evidence).length;
  const instructionCount = instructionCountOf(input);
  if (acceptedImages === 0 && instructionCount === 0)
    return "needs_review";
  return hasIdentityOf(input) ? "needs_review" : "error";
}

// packages/domain/dist/domain/vrm-filter.js
var STRICT = /\b(?:[A-Z]{2}[0-9]{2}\s?[A-Z]{3}|[A-Z][0-9]{1,3}\s?[A-Z]{3}|[A-Z]{3}\s?[0-9]{1,3}[A-Z])\b/g;
var LOOSE = /\b[A-Z]{1,3}\s?[0-9]{1,4}\b/g;
var ANCHOR = /\b(?:registration|reg|vrm|vehicle|plate|number\s?plate)\b/i;
var EXCLUDE_WORDS = /* @__PURE__ */ new Set([
  "VAT",
  "TEL",
  "REF",
  "REFERENCE",
  "INVOICE",
  "INV",
  "PHONE",
  "FAX",
  "FAO",
  "PO",
  "ORDER",
  "ACCOUNT",
  "ACC"
]);
var EXCLUDE_LABEL = new RegExp(`\\b(?:${[...EXCLUDE_WORDS].join("|")})[:.#\\-\\s]*$`);
function isPostcodeOutward(upper, idx, cand) {
  const after = upper.slice(idx + cand.length);
  return /^\s?[0-9][A-Z]{2}\b/.test(after);
}
var POSTCODE_AREAS = /* @__PURE__ */ new Set([
  "AB",
  "AL",
  "B",
  "BA",
  "BB",
  "BD",
  "BH",
  "BL",
  "BN",
  "BR",
  "BS",
  "BT",
  "CA",
  "CB",
  "CF",
  "CH",
  "CM",
  "CO",
  "CR",
  "CT",
  "CV",
  "CW",
  "DA",
  "DD",
  "DE",
  "DG",
  "DH",
  "DL",
  "DN",
  "DT",
  "DY",
  "E",
  "EC",
  "EH",
  "EN",
  "EX",
  "FK",
  "FY",
  "G",
  "GL",
  "GU",
  "GY",
  "HA",
  "HD",
  "HG",
  "HP",
  "HR",
  "HS",
  "HU",
  "HX",
  "IG",
  "IM",
  "IP",
  "IV",
  "JE",
  "KA",
  "KT",
  "KW",
  "KY",
  "L",
  "LA",
  "LD",
  "LE",
  "LL",
  "LN",
  "LS",
  "LU",
  "M",
  "ME",
  "MK",
  "ML",
  "N",
  "NE",
  "NG",
  "NN",
  "NP",
  "NR",
  "NW",
  "OL",
  "OX",
  "PA",
  "PE",
  "PH",
  "PL",
  "PO",
  "PR",
  "RG",
  "RH",
  "RM",
  "S",
  "SA",
  "SE",
  "SG",
  "SK",
  "SL",
  "SM",
  "SN",
  "SO",
  "SP",
  "SR",
  "SS",
  "ST",
  "SW",
  "SY",
  "TA",
  "TD",
  "TF",
  "TN",
  "TQ",
  "TR",
  "TS",
  "TW",
  "UB",
  "W",
  "WA",
  "WC",
  "WD",
  "WF",
  "WN",
  "WR",
  "WS",
  "WV",
  "YO",
  "ZE"
]);
function isPostcodeOutwardCode(compact) {
  const m = /^([A-Z]{1,2})[0-9]{1,2}$/.exec(compact);
  return m !== null && POSTCODE_AREAS.has(m[1]);
}
function precededByExcludeLabel(upper, idx) {
  const before = upper.slice(Math.max(0, idx - 16), idx);
  return EXCLUDE_LABEL.test(before);
}
function extractVrm(text) {
  if (!text)
    return "";
  const upper = text.toUpperCase();
  for (const m of upper.matchAll(STRICT)) {
    const cand = m[0];
    if (isPostcodeOutward(upper, m.index ?? 0, cand))
      continue;
    return cand.replace(/\s+/g, "");
  }
  if (ANCHOR.test(text)) {
    for (const m of upper.matchAll(LOOSE)) {
      const cand = m[0];
      const idx = m.index ?? 0;
      const compact = cand.replace(/\s+/g, "");
      if (isPostcodeOutward(upper, idx, cand))
        continue;
      if (isPostcodeOutwardCode(compact))
        continue;
      const alpha = cand.match(/^[A-Z]+/)?.[0] ?? "";
      if (EXCLUDE_WORDS.has(alpha))
        continue;
      if (precededByExcludeLabel(upper, idx))
        continue;
      return compact;
    }
  }
  return "";
}

// packages/domain/dist/domain/case-po.js
var CASE_PO_SEQ_WIDTH = 3;
function formatCasePo(principalCode, year2, seq) {
  const principal = String(principalCode).trim().toUpperCase();
  const yy = String(year2).trim().padStart(2, "0").slice(-2);
  const n = Math.max(0, Math.trunc(Number(seq) || 0));
  return `${principal}${yy}${String(n).padStart(CASE_PO_SEQ_WIDTH, "0")}`;
}
function casePoYear(d = /* @__PURE__ */ new Date()) {
  return String(d.getFullYear() % 100).padStart(2, "0");
}
function casePoSequenceRegex(principal, yy) {
  return `^${principal.toUpperCase()}${yy}[0-9]{${CASE_PO_SEQ_WIDTH},}$`;
}

// packages/domain/dist/domain/pii-scrub.js
var DEFAULT_PLACEHOLDERS = {
  email: "[EMAIL]",
  phone: "[PHONE]",
  postcode: "[POSTCODE]",
  address: "[ADDRESS]",
  nino: "[NINO]",
  name: "[NAME]",
  vrm: "[VRM]"
};
var EMAIL_RE = /(?<![\w])[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?![\w])/g;
var NINO_RE = /(?<![\w])[ABCEGHJ-PRSTW-Z][ABCEGHJ-NPRSTW-Z][\s-]?\d{2}[\s-]?\d{2}[\s-]?\d{2}[\s-]?[A-D](?![\w])/gi;
var ADDRESS_RE = /(?<![\w])\d{1,4}[A-Za-z]?[\s,]+(?:[A-Z][A-Za-z'-]+[\s,]+){1,4}(?:Road|Rd|Street|St|Avenue|Ave|Lane|Ln|Drive|Dr|Close|Cl|Way|Court|Ct|Crescent|Cres|Place|Pl|Terrace|Gardens|Grove|Grv|Walk|Row|Hill|Park)\b\.?/g;
var POSTCODE_RE = /(?<![\w])(?:[A-Z]{1,2}\d[A-Z\d]?|GIR)[\s-]?\d[A-Z]{2}(?![\w])/gi;
var PHONE_RE = /(?<![\w])(?:\+44[\s-]?\(?0?\)?|\(?0)(?:[\s\-()]{0,2}\d){9,10}(?![\w])/g;
var NAME_RE = /(?<![\w])(?:Mr|Mrs|Ms|Miss|Dr|Prof)\.?\s+[A-Z](?:[A-Za-z'-]+|\.)?(?:\s+[A-Z](?:[A-Za-z'-]+|\.)?){0,2}/g;
var VRM_RE = /(?<![\w])(?:[A-Z]{2}\d{2}[\s-]?[A-Z]{3}|[A-Z]\d{1,3}[\s-]?[A-Z]{3}|[A-Z]{3}[\s-]?\d{1,3}[A-Z])(?![\w])/gi;
var RULES = [
  { kind: "email", re: EMAIL_RE, enabled: () => true },
  { kind: "nino", re: NINO_RE, enabled: () => true },
  { kind: "address", re: ADDRESS_RE, enabled: () => true },
  { kind: "postcode", re: POSTCODE_RE, enabled: () => true },
  { kind: "phone", re: PHONE_RE, enabled: () => true },
  { kind: "name", re: NAME_RE, enabled: (o) => o.redactNames },
  { kind: "vrm", re: VRM_RE, enabled: (o) => o.redactVrm }
];
function scrubPii(input, opts = {}) {
  const cfg = {
    redactVrm: opts.redactVrm ?? false,
    redactNames: opts.redactNames ?? true
  };
  const placeholderFor = (kind) => opts.placeholders?.[kind] ?? DEFAULT_PLACEHOLDERS[kind];
  if (typeof input !== "string" || input.length === 0) {
    return { text: typeof input === "string" ? input : "", redactions: [], totalRedactions: 0 };
  }
  let text = input;
  const redactions = [];
  for (const rule of RULES) {
    if (!rule.enabled(cfg))
      continue;
    let count = 0;
    const placeholder = placeholderFor(rule.kind);
    rule.re.lastIndex = 0;
    text = text.replace(rule.re, () => {
      count += 1;
      return placeholder;
    });
    if (count > 0)
      redactions.push({ kind: rule.kind, count });
  }
  const totalRedactions = redactions.reduce((sum, r) => sum + r.count, 0);
  return { text, redactions, totalRedactions };
}

// packages/domain/dist/model/queues.js
var QUEUES = [
  {
    name: "not-ready",
    routeSegment: "not-ready",
    label: "Not ready",
    shortLabel: "Not ready",
    // Arrived and progressing, but not yet complete: waiting on images, waiting
    // on instructions/fields, just-arrived/settling, or a merged case still
    // missing a required detail (e.g. the inspection address).
    statuses: [
      "new_email",
      "ingested",
      "missing_images",
      "missing_required_fields",
      "needs_review",
      "linked_to_instruction"
    ],
    tone: "muted"
  },
  {
    name: "review",
    routeSegment: "review",
    label: "Review",
    shortLabel: "Review",
    // Everything required is present — the human-in-the-loop check before EVA
    // submit. (A full-auto provider would have auto-submitted and never appear.)
    statuses: ["ready_for_eva"],
    tone: "blocker"
  },
  {
    name: "held",
    routeSegment: "held",
    label: "Held",
    shortLabel: "Held",
    // Parked: cannot pass through automatically (errored, or missing the basics a
    // case needs at all — VRM / claimant), a possible duplicate awaiting a
    // decision, or put on hold by a person (the `onHold` flag, routed in the
    // data source). See the case-status tree + dedup (ADR-0010).
    statuses: ["error", "duplicate_risk"],
    tone: "blocker"
  }
];
function statusToQueue(status) {
  return QUEUES.find((qq) => qq.statuses.includes(status))?.name;
}
function queueByName(name) {
  return QUEUES.find((q) => q.name === name);
}
function statusToStage(status) {
  switch (status) {
    case "new_email":
    case "ingested":
      return "new";
    case "missing_images":
    case "missing_required_fields":
    case "needs_review":
    case "linked_to_instruction":
      return "not_ready";
    case "ready_for_eva":
      return "review";
    case "eva_submitted":
    case "box_synced":
      return "submitted";
    case "error":
    case "duplicate_risk":
      return void 0;
  }
}
var REASON_LABELS = {
  missing_images: "Missing images",
  missing_instructions: "Missing instructions",
  duplicate: "Duplicate",
  conflict: "Conflict",
  needs_review: "Needs review"
};

// packages/domain/dist/dto/index.js
var BOX_GATES_ALL_FALSE = {
  apiEnabled: false,
  folderAtIntakeEnabled: false,
  fileRequestEnabled: false,
  embedEnabled: false,
  metadataEnabled: false,
  fileRequestTemplateConfigured: false
};
var LOCATION_ASSIST_GATE_ALL_OFF = {
  assistEnabled: false,
  mapsEnabled: false,
  apiBaseConfigured: false,
  enabled: false
};
var AI_ASSIST_GATE_ALL_OFF = {
  enabled: false,
  modelConfigured: false
};
var INBOUND_COUNTS_ZERO = {
  receiving_work: 0,
  query: 0,
  other: 0,
  untriaged: 0
};

// packages/domain/dist/data/choicesets/case-status.json
var case_status_default = {
  $schema: "../schema/_choiceset.schema.json",
  kind: "global-choice-set",
  logicalName: "cr1bd_casestatus",
  displayName: "Case Status",
  description: "The Case workflow state machine. Reconciled 1:1 against the prototype CaseStatus union (mockup-app/src/mock/types.ts) and data-model.md \xA7'Case status state machine'. The Vitest parity test asserts these labels equal the contracts' CaseStatus union exactly. Order of `value` integers follows the canonical pipeline + branch ordering; integer values are stable identifiers and MUST NOT be renumbered once deployed.",
  isGlobal: true,
  parityKey: "value",
  options: [
    { value: 1e8, name: "new_email", label: "New Email" },
    { value: 100000001, name: "ingested", label: "Ingested" },
    { value: 100000002, name: "needs_review", label: "Needs Review" },
    { value: 100000003, name: "missing_required_fields", label: "Missing Required Fields" },
    { value: 100000004, name: "missing_images", label: "Missing Images" },
    { value: 100000005, name: "duplicate_risk", label: "Duplicate Risk" },
    { value: 100000006, name: "linked_to_instruction", label: "Linked to Instruction" },
    { value: 100000007, name: "ready_for_eva", label: "Ready for EVA" },
    { value: 100000008, name: "eva_submitted", label: "EVA Submitted" },
    { value: 100000009, name: "box_synced", label: "Box Synced" },
    { value: 100000010, name: "error", label: "Error" },
    { value: 100000011, name: "removed", label: "Removed" }
  ],
  stateMachine: {
    linear: ["new_email", "ingested", "needs_review", "ready_for_eva", "eva_submitted", "box_synced"],
    branches: ["missing_required_fields", "missing_images", "duplicate_risk", "linked_to_instruction"],
    terminals: ["eva_submitted", "box_synced", "error", "removed"]
  }
};

// packages/domain/dist/data/choicesets/action-reason.json
var action_reason_default = {
  $schema: "../schema/_choiceset.schema.json",
  kind: "global-choice-set",
  logicalName: "cr1bd_actionreason",
  displayName: "Action Reason",
  description: "Case.actionReason \u2014 why a PERSON must act on a case (needs-action cases only; null otherwise). Matches the prototype ActionReason union (mock/types.ts) 1:1. Stored (not derived) per Phase-1 Risk #9 so the dashboard facet chips + aging tallies can group server-side.",
  isGlobal: true,
  options: [
    { value: 1e8, name: "missing_images", label: "Missing Images" },
    { value: 100000001, name: "missing_instructions", label: "Missing Instructions" },
    { value: 100000002, name: "duplicate", label: "Duplicate" },
    { value: 100000003, name: "conflict", label: "Conflict" },
    { value: 100000004, name: "needs_review", label: "Needs Review" }
  ]
};

// packages/domain/dist/data/choicesets/inspection-decision-mode.json
var inspection_decision_mode_default = {
  $schema: "../schema/_choiceset.schema.json",
  kind: "global-choice-set",
  logicalName: "cr1bd_inspectiondecisionmode",
  displayName: "Inspection Decision Mode",
  description: "InspectionAddress.decisionMode (and Case.inspectionDecision mirror) \u2014 how the inspection location was decided. `image_based` ALWAYS requires an explicit reviewer decision + reason (never a silent pass); enforced in the M1 policy gate (\xA75.9).",
  isGlobal: true,
  default: "unknown",
  options: [
    { value: 1e8, name: "confirmed_physical", label: "Confirmed Physical" },
    { value: 100000001, name: "manual", label: "Manual" },
    { value: 100000002, name: "image_based", label: "Image Based" },
    { value: 100000003, name: "unknown", label: "Unknown" }
  ]
};

// packages/domain/dist/data/choicesets/intake-channel.json
var intake_channel_default = {
  $schema: "../schema/_choiceset.schema.json",
  kind: "global-choice-set",
  logicalName: "cr1bd_intakechannelkind",
  displayName: "Intake Channel Kind",
  description: "Case.intakeChannelKind \u2014 how an item arrived. Audatex is OUT OF SCOPE. WhatsApp intake is manual (ADR-0007). Channel MODE (auto|manual) is a separate boolean column (cr1bd_intakechannelmanual) on the Case table.",
  isGlobal: true,
  options: [
    { value: 1e8, name: "email", label: "Email" },
    { value: 100000001, name: "whatsapp", label: "WhatsApp" }
  ]
};

// packages/domain/dist/data/choicesets/evidence-kind.json
var evidence_kind_default = {
  $schema: "../schema/_choiceset.schema.json",
  kind: "global-choice-set",
  logicalName: "cr1bd_evidencekind",
  displayName: "Evidence Kind",
  description: "Evidence.kind \u2014 deterministic classification of an attachment (graph-intake parity). `.jpg/.jpeg/.png` -> image; `.pdf/.docx/.doc` -> instruction; the message MIME (.eml) -> email; valuation Companion Report -> valuation; the generated EVA drag-drop JSON -> eva_payload; everything else -> other. Prototype union (mock/types.ts EvidenceKind) lacks `other`; it is added per data-model.md \xA7Evidence + Phase-1 \xA74. engineer_report = a THIRD-PARTY engineer\u2019s ORIGINAL report on an AUDIT case (ADR-0014), stored for comparison \u2014 never overlaid.",
  isGlobal: true,
  options: [
    { value: 1e8, name: "image", label: "Image" },
    { value: 100000001, name: "video", label: "Video" },
    { value: 100000002, name: "instruction", label: "Instruction" },
    { value: 100000003, name: "email", label: "Email (.eml)" },
    { value: 100000004, name: "valuation", label: "Valuation" },
    { value: 100000005, name: "eva_payload", label: "EVA Payload" },
    { value: 100000006, name: "other", label: "Other" },
    { value: 100000007, name: "engineer_report", label: "Engineer Report (audited)" }
  ]
};

// packages/domain/dist/data/choicesets/image-role.json
var image_role_default = {
  $schema: "../schema/_choiceset.schema.json",
  kind: "global-choice-set",
  logicalName: "cr1bd_imagerole",
  displayName: "Image Role",
  description: "Evidence.imageRole \u2014 mirrors collisioncc image-rules. Default is `unknown`; role tagging is MANUAL until M2 image AI. EVA image-rules require >=1 overview (registration visible) + >=1 damage_closeup.",
  isGlobal: true,
  default: "unknown",
  options: [
    { value: 1e8, name: "overview", label: "Overview" },
    { value: 100000001, name: "damage_closeup", label: "Damage Closeup" },
    { value: 100000002, name: "additional", label: "Additional" },
    { value: 100000003, name: "unknown", label: "Unknown" }
  ]
};

// packages/domain/dist/data/choicesets/review-state.json
var review_state_default = {
  $schema: "../schema/_choiceset.schema.json",
  kind: "global-choice-set",
  logicalName: "cr1bd_reviewstate",
  displayName: "Review State",
  description: "FieldLevelProvenance.reviewState \u2014 the review lifecycle of a single field value. Matches the prototype ReviewState union (mock/types.ts) 1:1. Conflict rule: when an enrichment value differs from an existing non-empty value, set `conflict` and never overwrite silently (mileage: document authoritative).",
  isGlobal: true,
  default: "needs_review",
  options: [
    { value: 1e8, name: "not_required", label: "Not Required" },
    { value: 100000001, name: "needs_review", label: "Needs Review" },
    { value: 100000002, name: "reviewed", label: "Reviewed" },
    { value: 100000003, name: "conflict", label: "Conflict" }
  ]
};

// packages/domain/dist/data/choicesets/field-provenance-source-type.json
var field_provenance_source_type_default = {
  $schema: "../schema/_choiceset.schema.json",
  kind: "global-choice-set",
  logicalName: "cr1bd_fieldprovenancesourcetype",
  displayName: "Field Provenance Source Type",
  description: "FieldLevelProvenance.sourceType \u2014 where a field value came from. Matches the prototype ProvenanceSourceType union (mock/types.ts) 1:1, with cloud_vision normalised to azure_vision (Microsoft stack). Phase-1 writers: parser -> pdf_extraction; email body -> email_text; DVSA -> dvla_dvsa; corpus/domain match -> corpus; staff edit -> staff.",
  isGlobal: true,
  options: [
    { value: 1e8, name: "staff", label: "Staff" },
    { value: 100000001, name: "pdf_extraction", label: "PDF Extraction" },
    { value: 100000002, name: "email_text", label: "Email Text" },
    { value: 100000003, name: "corpus", label: "Corpus" },
    { value: 100000004, name: "ai", label: "AI" },
    { value: 100000005, name: "dvla_dvsa", label: "DVLA / DVSA" },
    { value: 100000006, name: "document_ai", label: "Document AI" },
    { value: 100000007, name: "azure_vision", label: "Azure Vision" },
    { value: 100000008, name: "web_lookup", label: "Web Lookup" },
    { value: 100000009, name: "whatsapp", label: "WhatsApp" },
    { value: 100000010, name: "manual_upload", label: "Manual Upload" }
  ]
};

// packages/domain/dist/data/choicesets/inspection-location-policy.json
var inspection_location_policy_default = {
  $schema: "../schema/_choiceset.schema.json",
  kind: "global-choice-set",
  logicalName: "cr1bd_inspectionlocationpolicy",
  displayName: "Inspection Location Policy",
  description: "WorkProvider.inspectionLocationPolicy \u2014 the binding enum (inspection-address.md + provider-corpus.md). Drives the M1 address policy gate. `prefer_address` is the default for UNKNOWN providers. NOTE: this REPLACES the stale prototype Provider enum ('physical'|'image_based'|'mixed', mock/types.ts ~line 199) which is to be updated to this set in Phase 1 (\xA75.10 / Risk #6). No path may yield 'Image Based Assessment' without an explicit reviewer decision + reason.",
  isGlobal: true,
  default: "prefer_address",
  options: [
    { value: 1e8, name: "always_image_based", label: "Always Image Based" },
    { value: 100000001, name: "prefer_address", label: "Prefer Address" },
    { value: 100000002, name: "required_address", label: "Required Address" }
  ]
};

// packages/domain/dist/data/choicesets/provider-automation-mode.json
var provider_automation_mode_default = {
  $schema: "../schema/_choiceset.schema.json",
  kind: "global-choice-set",
  logicalName: "cr1bd_providerautomationmode",
  displayName: "Provider Automation Mode",
  description: "WorkProvider.providerAutomationMode \u2014 how much automation a provider's intake is trusted with. Only `review_auto` is honored in M1 (others modeled but inert; per-provider toggles deferred to global env-var kill switches). `manual` = no auto-pipeline; `review_auto` = auto-parse/enrich but human review before EVA; `full_auto` = reserved/deferred.",
  isGlobal: true,
  default: "review_auto",
  options: [
    { value: 1e8, name: "manual", label: "Manual" },
    { value: 100000001, name: "review_auto", label: "Review Auto" },
    { value: 100000002, name: "full_auto", label: "Full Auto (deferred)" }
  ]
};

// packages/domain/dist/data/choicesets/audit-event.json
var audit_event_default = {
  $schema: "../schema/_choiceset.schema.json",
  kind: "global-choice-set-bundle",
  description: "AuditEvent enums. Append-only audit vocabulary (Phase-1 \xA74). `action` is the controlled vocabulary of flow/staff actions; `severity` is the log level.",
  choiceSets: [
    {
      logicalName: "cr1bd_auditaction",
      displayName: "Audit Action",
      isGlobal: true,
      description: "Controlled action vocabulary mirrored from Phase-1 \xA74 AuditEvent + the corpus import + EVA/Box finalization actions + the Phase-8 inbound-email triage actions. Extend additively only (never renumber). NOTE: location_assist_confirmed (100000022) is RESERVED/forward-declared for the Phase-4a live location-suggestion assist \u2014 no emitter exists yet; it is written once the InspectionAddress confirm/save path (Code App or a flow) is wired. See docs/plans/phase-4-address-and-chaser/location-suggest-v1-BUILD.md. Phase-8 (ADR-0015): inbound_classified (100000024) is written when the triage-classify flow records a /classify-email label on a cr1bd_inboundemail row; inbound_routed (100000025) is written when a receiving_work row is routed to the Case chain (or a query is linked to its open Case).",
      options: [
        { value: 1e8, name: "graph_message_ingested", label: "Graph Message Ingested" },
        { value: 100000001, name: "graph_message_ingest_failed", label: "Graph Message Ingest Failed" },
        { value: 100000002, name: "attachment_classified", label: "Attachment Classified" },
        { value: 100000003, name: "case_created", label: "Case Created" },
        { value: 100000004, name: "case_attached", label: "Case Attached" },
        { value: 100000005, name: "duplicate_dropped", label: "Duplicate Dropped" },
        { value: 100000006, name: "duplicate_flagged", label: "Duplicate Flagged" },
        { value: 100000007, name: "provider_matched", label: "Provider Matched" },
        { value: 100000008, name: "provider_unmatched", label: "Provider Unmatched" },
        { value: 100000009, name: "parser_called", label: "Parser Called" },
        { value: 100000010, name: "parser_failed", label: "Parser Failed" },
        { value: 100000011, name: "enrichment_called", label: "Enrichment Called" },
        { value: 100000012, name: "enrichment_failed", label: "Enrichment Failed" },
        { value: 100000013, name: "status_changed", label: "Status Changed" },
        { value: 100000014, name: "jobsheet_imported", label: "Job Sheet Imported" },
        { value: 100000015, name: "eva_submitted", label: "EVA Submitted" },
        { value: 100000016, name: "box_synced", label: "Box Synced" },
        { value: 100000017, name: "corpus_record_changed", label: "Corpus Record Changed" },
        { value: 100000018, name: "inspection_override", label: "Inspection Override" },
        { value: 100000019, name: "box_folder_created", label: "Box Folder Created" },
        { value: 100000020, name: "box_file_request_copied", label: "Box File Request Copied" },
        { value: 100000021, name: "box_upload_received", label: "Box Upload Received" },
        { value: 100000022, name: "location_assist_confirmed", label: "Location Assist Confirmed" },
        { value: 100000023, name: "chaser_sent", label: "Chaser Sent" },
        { value: 100000024, name: "inbound_classified", label: "Inbound Classified" },
        { value: 100000025, name: "inbound_routed", label: "Inbound Routed" },
        { value: 100000026, name: "case_disposed", label: "Case Disposed" },
        { value: 100000027, name: "inbound_dismissed", label: "Inbound Dismissed" },
        { value: 100000028, name: "inbound_actioned", label: "Inbound Actioned" },
        { value: 100000029, name: "inbound_reopened", label: "Inbound Reopened" },
        { value: 100000030, name: "case_removed", label: "Case Removed" },
        { value: 100000031, name: "inbound_reclassified", label: "Inbound Reclassified" }
      ]
    },
    {
      logicalName: "cr1bd_auditseverity",
      displayName: "Audit Severity",
      isGlobal: true,
      default: "info",
      options: [
        { value: 1e8, name: "info", label: "Info" },
        { value: 100000001, name: "warning", label: "Warning" },
        { value: 100000002, name: "error", label: "Error" }
      ]
    }
  ]
};

// packages/domain/dist/codecs/index.js
function makeChoiceCodec(cs) {
  const byValue = /* @__PURE__ */ new Map();
  const byName = /* @__PURE__ */ new Map();
  for (const o of cs.options) {
    byValue.set(o.value, o.name);
    byName.set(o.name, o.value);
  }
  return {
    logicalName: cs.logicalName,
    toName: (value) => value == null ? void 0 : byValue.get(value),
    toInt: (name) => name == null ? void 0 : byName.get(name),
    names: () => cs.options.map((o) => o.name),
    values: () => cs.options.map((o) => o.value)
  };
}
var caseStatusCodec = makeChoiceCodec(case_status_default);
var actionReasonCodec = makeChoiceCodec(action_reason_default);
var inspectionDecisionCodec = makeChoiceCodec(inspection_decision_mode_default);
var intakeChannelKindCodec = makeChoiceCodec(intake_channel_default);
var evidenceKindCodec = makeChoiceCodec(evidence_kind_default);
var imageRoleCodec = makeChoiceCodec(image_role_default);
var reviewStateCodec = makeChoiceCodec(review_state_default);
var sourceTypeCodec = makeChoiceCodec(field_provenance_source_type_default);
var inspectionPolicyCodec = makeChoiceCodec(inspection_location_policy_default);
var automationModeCodec = makeChoiceCodec(provider_automation_mode_default);
var auditActionSet = audit_event_default.choiceSets.find((s) => s.logicalName === "cr1bd_auditaction");
var auditActionCodec = makeChoiceCodec(auditActionSet);
function auditActionToActivityKind(action) {
  switch (action) {
    case "graph_message_ingested":
    case "graph_message_ingest_failed":
    case "case_created":
    case "case_attached":
      return "intake";
    case "attachment_classified":
    case "provider_matched":
    case "provider_unmatched":
      return "classify";
    case "parser_called":
    case "parser_failed":
      return "parse";
    case "enrichment_called":
    case "enrichment_failed":
      return "enrich";
    case "duplicate_dropped":
    case "duplicate_flagged":
      return "dedup";
    case "eva_submitted":
      return "eva_submit";
    case "box_synced":
    case "box_folder_created":
    case "box_file_request_copied":
    case "box_upload_received":
      return "box_sync";
    case "jobsheet_imported":
    case "corpus_record_changed":
    case "inspection_override":
      return "note";
    case "status_changed":
    default:
      return "status_change";
  }
}
function statusToInt(status) {
  const value = caseStatusCodec.toInt(status);
  if (value == null)
    throw new Error(`Unknown CaseStatus: ${status}`);
  return value;
}

// node_modules/jose/dist/node/esm/runtime/base64url.js
var import_node_buffer = require("node:buffer");

// node_modules/jose/dist/node/esm/lib/buffer_utils.js
var encoder = new TextEncoder();
var decoder = new TextDecoder();
var MAX_INT32 = 2 ** 32;
function concat(...buffers) {
  const size = buffers.reduce((acc, { length }) => acc + length, 0);
  const buf = new Uint8Array(size);
  let i = 0;
  for (const buffer of buffers) {
    buf.set(buffer, i);
    i += buffer.length;
  }
  return buf;
}

// node_modules/jose/dist/node/esm/runtime/base64url.js
function normalize(input) {
  let encoded = input;
  if (encoded instanceof Uint8Array) {
    encoded = decoder.decode(encoded);
  }
  return encoded;
}
var decode = (input) => new Uint8Array(import_node_buffer.Buffer.from(normalize(input), "base64url"));

// node_modules/jose/dist/node/esm/util/errors.js
var errors_exports = {};
__export(errors_exports, {
  JOSEAlgNotAllowed: () => JOSEAlgNotAllowed,
  JOSEError: () => JOSEError,
  JOSENotSupported: () => JOSENotSupported,
  JWEDecryptionFailed: () => JWEDecryptionFailed,
  JWEInvalid: () => JWEInvalid,
  JWKInvalid: () => JWKInvalid,
  JWKSInvalid: () => JWKSInvalid,
  JWKSMultipleMatchingKeys: () => JWKSMultipleMatchingKeys,
  JWKSNoMatchingKey: () => JWKSNoMatchingKey,
  JWKSTimeout: () => JWKSTimeout,
  JWSInvalid: () => JWSInvalid,
  JWSSignatureVerificationFailed: () => JWSSignatureVerificationFailed,
  JWTClaimValidationFailed: () => JWTClaimValidationFailed,
  JWTExpired: () => JWTExpired,
  JWTInvalid: () => JWTInvalid
});
var JOSEError = class extends Error {
  static code = "ERR_JOSE_GENERIC";
  code = "ERR_JOSE_GENERIC";
  constructor(message2, options) {
    super(message2, options);
    this.name = this.constructor.name;
    Error.captureStackTrace?.(this, this.constructor);
  }
};
var JWTClaimValidationFailed = class extends JOSEError {
  static code = "ERR_JWT_CLAIM_VALIDATION_FAILED";
  code = "ERR_JWT_CLAIM_VALIDATION_FAILED";
  claim;
  reason;
  payload;
  constructor(message2, payload, claim = "unspecified", reason = "unspecified") {
    super(message2, { cause: { claim, reason, payload } });
    this.claim = claim;
    this.reason = reason;
    this.payload = payload;
  }
};
var JWTExpired = class extends JOSEError {
  static code = "ERR_JWT_EXPIRED";
  code = "ERR_JWT_EXPIRED";
  claim;
  reason;
  payload;
  constructor(message2, payload, claim = "unspecified", reason = "unspecified") {
    super(message2, { cause: { claim, reason, payload } });
    this.claim = claim;
    this.reason = reason;
    this.payload = payload;
  }
};
var JOSEAlgNotAllowed = class extends JOSEError {
  static code = "ERR_JOSE_ALG_NOT_ALLOWED";
  code = "ERR_JOSE_ALG_NOT_ALLOWED";
};
var JOSENotSupported = class extends JOSEError {
  static code = "ERR_JOSE_NOT_SUPPORTED";
  code = "ERR_JOSE_NOT_SUPPORTED";
};
var JWEDecryptionFailed = class extends JOSEError {
  static code = "ERR_JWE_DECRYPTION_FAILED";
  code = "ERR_JWE_DECRYPTION_FAILED";
  constructor(message2 = "decryption operation failed", options) {
    super(message2, options);
  }
};
var JWEInvalid = class extends JOSEError {
  static code = "ERR_JWE_INVALID";
  code = "ERR_JWE_INVALID";
};
var JWSInvalid = class extends JOSEError {
  static code = "ERR_JWS_INVALID";
  code = "ERR_JWS_INVALID";
};
var JWTInvalid = class extends JOSEError {
  static code = "ERR_JWT_INVALID";
  code = "ERR_JWT_INVALID";
};
var JWKInvalid = class extends JOSEError {
  static code = "ERR_JWK_INVALID";
  code = "ERR_JWK_INVALID";
};
var JWKSInvalid = class extends JOSEError {
  static code = "ERR_JWKS_INVALID";
  code = "ERR_JWKS_INVALID";
};
var JWKSNoMatchingKey = class extends JOSEError {
  static code = "ERR_JWKS_NO_MATCHING_KEY";
  code = "ERR_JWKS_NO_MATCHING_KEY";
  constructor(message2 = "no applicable key found in the JSON Web Key Set", options) {
    super(message2, options);
  }
};
var JWKSMultipleMatchingKeys = class extends JOSEError {
  [Symbol.asyncIterator];
  static code = "ERR_JWKS_MULTIPLE_MATCHING_KEYS";
  code = "ERR_JWKS_MULTIPLE_MATCHING_KEYS";
  constructor(message2 = "multiple matching keys found in the JSON Web Key Set", options) {
    super(message2, options);
  }
};
var JWKSTimeout = class extends JOSEError {
  static code = "ERR_JWKS_TIMEOUT";
  code = "ERR_JWKS_TIMEOUT";
  constructor(message2 = "request timed out", options) {
    super(message2, options);
  }
};
var JWSSignatureVerificationFailed = class extends JOSEError {
  static code = "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
  code = "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
  constructor(message2 = "signature verification failed", options) {
    super(message2, options);
  }
};

// node_modules/jose/dist/node/esm/runtime/is_key_object.js
var util = __toESM(require("node:util"), 1);
var is_key_object_default = (obj) => util.types.isKeyObject(obj);

// node_modules/jose/dist/node/esm/runtime/webcrypto.js
var crypto = __toESM(require("node:crypto"), 1);
var util2 = __toESM(require("node:util"), 1);
var webcrypto2 = crypto.webcrypto;
var webcrypto_default = webcrypto2;
var isCryptoKey = (key) => util2.types.isCryptoKey(key);

// node_modules/jose/dist/node/esm/lib/crypto_key.js
function unusable(name, prop = "algorithm.name") {
  return new TypeError(`CryptoKey does not support this operation, its ${prop} must be ${name}`);
}
function isAlgorithm(algorithm, name) {
  return algorithm.name === name;
}
function getHashLength(hash) {
  return parseInt(hash.name.slice(4), 10);
}
function getNamedCurve(alg) {
  switch (alg) {
    case "ES256":
      return "P-256";
    case "ES384":
      return "P-384";
    case "ES512":
      return "P-521";
    default:
      throw new Error("unreachable");
  }
}
function checkUsage(key, usages) {
  if (usages.length && !usages.some((expected) => key.usages.includes(expected))) {
    let msg = "CryptoKey does not support this operation, its usages must include ";
    if (usages.length > 2) {
      const last = usages.pop();
      msg += `one of ${usages.join(", ")}, or ${last}.`;
    } else if (usages.length === 2) {
      msg += `one of ${usages[0]} or ${usages[1]}.`;
    } else {
      msg += `${usages[0]}.`;
    }
    throw new TypeError(msg);
  }
}
function checkSigCryptoKey(key, alg, ...usages) {
  switch (alg) {
    case "HS256":
    case "HS384":
    case "HS512": {
      if (!isAlgorithm(key.algorithm, "HMAC"))
        throw unusable("HMAC");
      const expected = parseInt(alg.slice(2), 10);
      const actual = getHashLength(key.algorithm.hash);
      if (actual !== expected)
        throw unusable(`SHA-${expected}`, "algorithm.hash");
      break;
    }
    case "RS256":
    case "RS384":
    case "RS512": {
      if (!isAlgorithm(key.algorithm, "RSASSA-PKCS1-v1_5"))
        throw unusable("RSASSA-PKCS1-v1_5");
      const expected = parseInt(alg.slice(2), 10);
      const actual = getHashLength(key.algorithm.hash);
      if (actual !== expected)
        throw unusable(`SHA-${expected}`, "algorithm.hash");
      break;
    }
    case "PS256":
    case "PS384":
    case "PS512": {
      if (!isAlgorithm(key.algorithm, "RSA-PSS"))
        throw unusable("RSA-PSS");
      const expected = parseInt(alg.slice(2), 10);
      const actual = getHashLength(key.algorithm.hash);
      if (actual !== expected)
        throw unusable(`SHA-${expected}`, "algorithm.hash");
      break;
    }
    case "EdDSA": {
      if (key.algorithm.name !== "Ed25519" && key.algorithm.name !== "Ed448") {
        throw unusable("Ed25519 or Ed448");
      }
      break;
    }
    case "Ed25519": {
      if (!isAlgorithm(key.algorithm, "Ed25519"))
        throw unusable("Ed25519");
      break;
    }
    case "ES256":
    case "ES384":
    case "ES512": {
      if (!isAlgorithm(key.algorithm, "ECDSA"))
        throw unusable("ECDSA");
      const expected = getNamedCurve(alg);
      const actual = key.algorithm.namedCurve;
      if (actual !== expected)
        throw unusable(expected, "algorithm.namedCurve");
      break;
    }
    default:
      throw new TypeError("CryptoKey does not support this operation");
  }
  checkUsage(key, usages);
}

// node_modules/jose/dist/node/esm/lib/invalid_key_input.js
function message(msg, actual, ...types5) {
  types5 = types5.filter(Boolean);
  if (types5.length > 2) {
    const last = types5.pop();
    msg += `one of type ${types5.join(", ")}, or ${last}.`;
  } else if (types5.length === 2) {
    msg += `one of type ${types5[0]} or ${types5[1]}.`;
  } else {
    msg += `of type ${types5[0]}.`;
  }
  if (actual == null) {
    msg += ` Received ${actual}`;
  } else if (typeof actual === "function" && actual.name) {
    msg += ` Received function ${actual.name}`;
  } else if (typeof actual === "object" && actual != null) {
    if (actual.constructor?.name) {
      msg += ` Received an instance of ${actual.constructor.name}`;
    }
  }
  return msg;
}
var invalid_key_input_default = (actual, ...types5) => {
  return message("Key must be ", actual, ...types5);
};
function withAlg(alg, actual, ...types5) {
  return message(`Key for the ${alg} algorithm must be `, actual, ...types5);
}

// node_modules/jose/dist/node/esm/runtime/is_key_like.js
var is_key_like_default = (key) => is_key_object_default(key) || isCryptoKey(key);
var types3 = ["KeyObject"];
if (globalThis.CryptoKey || webcrypto_default?.CryptoKey) {
  types3.push("CryptoKey");
}

// node_modules/jose/dist/node/esm/lib/is_disjoint.js
var isDisjoint = (...headers) => {
  const sources = headers.filter(Boolean);
  if (sources.length === 0 || sources.length === 1) {
    return true;
  }
  let acc;
  for (const header of sources) {
    const parameters = Object.keys(header);
    if (!acc || acc.size === 0) {
      acc = new Set(parameters);
      continue;
    }
    for (const parameter of parameters) {
      if (acc.has(parameter)) {
        return false;
      }
      acc.add(parameter);
    }
  }
  return true;
};
var is_disjoint_default = isDisjoint;

// node_modules/jose/dist/node/esm/lib/is_object.js
function isObjectLike(value) {
  return typeof value === "object" && value !== null;
}
function isObject(input) {
  if (!isObjectLike(input) || Object.prototype.toString.call(input) !== "[object Object]") {
    return false;
  }
  if (Object.getPrototypeOf(input) === null) {
    return true;
  }
  let proto = input;
  while (Object.getPrototypeOf(proto) !== null) {
    proto = Object.getPrototypeOf(proto);
  }
  return Object.getPrototypeOf(input) === proto;
}

// node_modules/jose/dist/node/esm/runtime/get_named_curve.js
var import_node_crypto = require("node:crypto");

// node_modules/jose/dist/node/esm/lib/is_jwk.js
function isJWK(key) {
  return isObject(key) && typeof key.kty === "string";
}
function isPrivateJWK(key) {
  return key.kty !== "oct" && typeof key.d === "string";
}
function isPublicJWK(key) {
  return key.kty !== "oct" && typeof key.d === "undefined";
}
function isSecretJWK(key) {
  return isJWK(key) && key.kty === "oct" && typeof key.k === "string";
}

// node_modules/jose/dist/node/esm/runtime/get_named_curve.js
var namedCurveToJOSE = (namedCurve) => {
  switch (namedCurve) {
    case "prime256v1":
      return "P-256";
    case "secp384r1":
      return "P-384";
    case "secp521r1":
      return "P-521";
    case "secp256k1":
      return "secp256k1";
    default:
      throw new JOSENotSupported("Unsupported key curve for this operation");
  }
};
var getNamedCurve2 = (kee, raw) => {
  let key;
  if (isCryptoKey(kee)) {
    key = import_node_crypto.KeyObject.from(kee);
  } else if (is_key_object_default(kee)) {
    key = kee;
  } else if (isJWK(kee)) {
    return kee.crv;
  } else {
    throw new TypeError(invalid_key_input_default(kee, ...types3));
  }
  if (key.type === "secret") {
    throw new TypeError('only "private" or "public" type keys can be used for this operation');
  }
  switch (key.asymmetricKeyType) {
    case "ed25519":
    case "ed448":
      return `Ed${key.asymmetricKeyType.slice(2)}`;
    case "x25519":
    case "x448":
      return `X${key.asymmetricKeyType.slice(1)}`;
    case "ec": {
      const namedCurve = key.asymmetricKeyDetails.namedCurve;
      if (raw) {
        return namedCurve;
      }
      return namedCurveToJOSE(namedCurve);
    }
    default:
      throw new TypeError("Invalid asymmetric key type for this operation");
  }
};
var get_named_curve_default = getNamedCurve2;

// node_modules/jose/dist/node/esm/runtime/check_key_length.js
var import_node_crypto2 = require("node:crypto");
var check_key_length_default = (key, alg) => {
  let modulusLength;
  try {
    if (key instanceof import_node_crypto2.KeyObject) {
      modulusLength = key.asymmetricKeyDetails?.modulusLength;
    } else {
      modulusLength = Buffer.from(key.n, "base64url").byteLength << 3;
    }
  } catch {
  }
  if (typeof modulusLength !== "number" || modulusLength < 2048) {
    throw new TypeError(`${alg} requires key modulusLength to be 2048 bits or larger`);
  }
};

// node_modules/jose/dist/node/esm/runtime/jwk_to_key.js
var import_node_crypto3 = require("node:crypto");
var parse = (key) => {
  if (key.d) {
    return (0, import_node_crypto3.createPrivateKey)({ format: "jwk", key });
  }
  return (0, import_node_crypto3.createPublicKey)({ format: "jwk", key });
};
var jwk_to_key_default = parse;

// node_modules/jose/dist/node/esm/key/import.js
async function importJWK(jwk, alg) {
  if (!isObject(jwk)) {
    throw new TypeError("JWK must be an object");
  }
  alg ||= jwk.alg;
  switch (jwk.kty) {
    case "oct":
      if (typeof jwk.k !== "string" || !jwk.k) {
        throw new TypeError('missing "k" (Key Value) Parameter value');
      }
      return decode(jwk.k);
    case "RSA":
      if ("oth" in jwk && jwk.oth !== void 0) {
        throw new JOSENotSupported('RSA JWK "oth" (Other Primes Info) Parameter value is not supported');
      }
    case "EC":
    case "OKP":
      return jwk_to_key_default({ ...jwk, alg });
    default:
      throw new JOSENotSupported('Unsupported "kty" (Key Type) Parameter value');
  }
}

// node_modules/jose/dist/node/esm/lib/check_key_type.js
var tag = (key) => key?.[Symbol.toStringTag];
var jwkMatchesOp = (alg, key, usage) => {
  if (key.use !== void 0 && key.use !== "sig") {
    throw new TypeError("Invalid key for this operation, when present its use must be sig");
  }
  if (key.key_ops !== void 0 && key.key_ops.includes?.(usage) !== true) {
    throw new TypeError(`Invalid key for this operation, when present its key_ops must include ${usage}`);
  }
  if (key.alg !== void 0 && key.alg !== alg) {
    throw new TypeError(`Invalid key for this operation, when present its alg must be ${alg}`);
  }
  return true;
};
var symmetricTypeCheck = (alg, key, usage, allowJwk) => {
  if (key instanceof Uint8Array)
    return;
  if (allowJwk && isJWK(key)) {
    if (isSecretJWK(key) && jwkMatchesOp(alg, key, usage))
      return;
    throw new TypeError(`JSON Web Key for symmetric algorithms must have JWK "kty" (Key Type) equal to "oct" and the JWK "k" (Key Value) present`);
  }
  if (!is_key_like_default(key)) {
    throw new TypeError(withAlg(alg, key, ...types3, "Uint8Array", allowJwk ? "JSON Web Key" : null));
  }
  if (key.type !== "secret") {
    throw new TypeError(`${tag(key)} instances for symmetric algorithms must be of type "secret"`);
  }
};
var asymmetricTypeCheck = (alg, key, usage, allowJwk) => {
  if (allowJwk && isJWK(key)) {
    switch (usage) {
      case "sign":
        if (isPrivateJWK(key) && jwkMatchesOp(alg, key, usage))
          return;
        throw new TypeError(`JSON Web Key for this operation be a private JWK`);
      case "verify":
        if (isPublicJWK(key) && jwkMatchesOp(alg, key, usage))
          return;
        throw new TypeError(`JSON Web Key for this operation be a public JWK`);
    }
  }
  if (!is_key_like_default(key)) {
    throw new TypeError(withAlg(alg, key, ...types3, allowJwk ? "JSON Web Key" : null));
  }
  if (key.type === "secret") {
    throw new TypeError(`${tag(key)} instances for asymmetric algorithms must not be of type "secret"`);
  }
  if (usage === "sign" && key.type === "public") {
    throw new TypeError(`${tag(key)} instances for asymmetric algorithm signing must be of type "private"`);
  }
  if (usage === "decrypt" && key.type === "public") {
    throw new TypeError(`${tag(key)} instances for asymmetric algorithm decryption must be of type "private"`);
  }
  if (key.algorithm && usage === "verify" && key.type === "private") {
    throw new TypeError(`${tag(key)} instances for asymmetric algorithm verifying must be of type "public"`);
  }
  if (key.algorithm && usage === "encrypt" && key.type === "private") {
    throw new TypeError(`${tag(key)} instances for asymmetric algorithm encryption must be of type "public"`);
  }
};
function checkKeyType(allowJwk, alg, key, usage) {
  const symmetric = alg.startsWith("HS") || alg === "dir" || alg.startsWith("PBES2") || /^A\d{3}(?:GCM)?KW$/.test(alg);
  if (symmetric) {
    symmetricTypeCheck(alg, key, usage, allowJwk);
  } else {
    asymmetricTypeCheck(alg, key, usage, allowJwk);
  }
}
var check_key_type_default = checkKeyType.bind(void 0, false);
var checkKeyTypeWithJwk = checkKeyType.bind(void 0, true);

// node_modules/jose/dist/node/esm/lib/validate_crit.js
function validateCrit(Err, recognizedDefault, recognizedOption, protectedHeader, joseHeader) {
  if (joseHeader.crit !== void 0 && protectedHeader?.crit === void 0) {
    throw new Err('"crit" (Critical) Header Parameter MUST be integrity protected');
  }
  if (!protectedHeader || protectedHeader.crit === void 0) {
    return /* @__PURE__ */ new Set();
  }
  if (!Array.isArray(protectedHeader.crit) || protectedHeader.crit.length === 0 || protectedHeader.crit.some((input) => typeof input !== "string" || input.length === 0)) {
    throw new Err('"crit" (Critical) Header Parameter MUST be an array of non-empty strings when present');
  }
  let recognized;
  if (recognizedOption !== void 0) {
    recognized = new Map([...Object.entries(recognizedOption), ...recognizedDefault.entries()]);
  } else {
    recognized = recognizedDefault;
  }
  for (const parameter of protectedHeader.crit) {
    if (!recognized.has(parameter)) {
      throw new JOSENotSupported(`Extension Header Parameter "${parameter}" is not recognized`);
    }
    if (joseHeader[parameter] === void 0) {
      throw new Err(`Extension Header Parameter "${parameter}" is missing`);
    }
    if (recognized.get(parameter) && protectedHeader[parameter] === void 0) {
      throw new Err(`Extension Header Parameter "${parameter}" MUST be integrity protected`);
    }
  }
  return new Set(protectedHeader.crit);
}
var validate_crit_default = validateCrit;

// node_modules/jose/dist/node/esm/lib/validate_algorithms.js
var validateAlgorithms = (option, algorithms) => {
  if (algorithms !== void 0 && (!Array.isArray(algorithms) || algorithms.some((s) => typeof s !== "string"))) {
    throw new TypeError(`"${option}" option must be an array of strings`);
  }
  if (!algorithms) {
    return void 0;
  }
  return new Set(algorithms);
};
var validate_algorithms_default = validateAlgorithms;

// node_modules/jose/dist/node/esm/runtime/verify.js
var crypto3 = __toESM(require("node:crypto"), 1);
var import_node_util2 = require("node:util");

// node_modules/jose/dist/node/esm/runtime/dsa_digest.js
function dsaDigest(alg) {
  switch (alg) {
    case "PS256":
    case "RS256":
    case "ES256":
    case "ES256K":
      return "sha256";
    case "PS384":
    case "RS384":
    case "ES384":
      return "sha384";
    case "PS512":
    case "RS512":
    case "ES512":
      return "sha512";
    case "Ed25519":
    case "EdDSA":
      return void 0;
    default:
      throw new JOSENotSupported(`alg ${alg} is not supported either by JOSE or your javascript runtime`);
  }
}

// node_modules/jose/dist/node/esm/runtime/node_key.js
var import_node_crypto4 = require("node:crypto");
var ecCurveAlgMap = /* @__PURE__ */ new Map([
  ["ES256", "P-256"],
  ["ES256K", "secp256k1"],
  ["ES384", "P-384"],
  ["ES512", "P-521"]
]);
function keyForCrypto(alg, key) {
  let asymmetricKeyType;
  let asymmetricKeyDetails;
  let isJWK2;
  if (key instanceof import_node_crypto4.KeyObject) {
    asymmetricKeyType = key.asymmetricKeyType;
    asymmetricKeyDetails = key.asymmetricKeyDetails;
  } else {
    isJWK2 = true;
    switch (key.kty) {
      case "RSA":
        asymmetricKeyType = "rsa";
        break;
      case "EC":
        asymmetricKeyType = "ec";
        break;
      case "OKP": {
        if (key.crv === "Ed25519") {
          asymmetricKeyType = "ed25519";
          break;
        }
        if (key.crv === "Ed448") {
          asymmetricKeyType = "ed448";
          break;
        }
        throw new TypeError("Invalid key for this operation, its crv must be Ed25519 or Ed448");
      }
      default:
        throw new TypeError("Invalid key for this operation, its kty must be RSA, OKP, or EC");
    }
  }
  let options;
  switch (alg) {
    case "Ed25519":
      if (asymmetricKeyType !== "ed25519") {
        throw new TypeError(`Invalid key for this operation, its asymmetricKeyType must be ed25519`);
      }
      break;
    case "EdDSA":
      if (!["ed25519", "ed448"].includes(asymmetricKeyType)) {
        throw new TypeError("Invalid key for this operation, its asymmetricKeyType must be ed25519 or ed448");
      }
      break;
    case "RS256":
    case "RS384":
    case "RS512":
      if (asymmetricKeyType !== "rsa") {
        throw new TypeError("Invalid key for this operation, its asymmetricKeyType must be rsa");
      }
      check_key_length_default(key, alg);
      break;
    case "PS256":
    case "PS384":
    case "PS512":
      if (asymmetricKeyType === "rsa-pss") {
        const { hashAlgorithm, mgf1HashAlgorithm, saltLength } = asymmetricKeyDetails;
        const length = parseInt(alg.slice(-3), 10);
        if (hashAlgorithm !== void 0 && (hashAlgorithm !== `sha${length}` || mgf1HashAlgorithm !== hashAlgorithm)) {
          throw new TypeError(`Invalid key for this operation, its RSA-PSS parameters do not meet the requirements of "alg" ${alg}`);
        }
        if (saltLength !== void 0 && saltLength > length >> 3) {
          throw new TypeError(`Invalid key for this operation, its RSA-PSS parameter saltLength does not meet the requirements of "alg" ${alg}`);
        }
      } else if (asymmetricKeyType !== "rsa") {
        throw new TypeError("Invalid key for this operation, its asymmetricKeyType must be rsa or rsa-pss");
      }
      check_key_length_default(key, alg);
      options = {
        padding: import_node_crypto4.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: import_node_crypto4.constants.RSA_PSS_SALTLEN_DIGEST
      };
      break;
    case "ES256":
    case "ES256K":
    case "ES384":
    case "ES512": {
      if (asymmetricKeyType !== "ec") {
        throw new TypeError("Invalid key for this operation, its asymmetricKeyType must be ec");
      }
      const actual = get_named_curve_default(key);
      const expected = ecCurveAlgMap.get(alg);
      if (actual !== expected) {
        throw new TypeError(`Invalid key curve for the algorithm, its curve must be ${expected}, got ${actual}`);
      }
      options = { dsaEncoding: "ieee-p1363" };
      break;
    }
    default:
      throw new JOSENotSupported(`alg ${alg} is not supported either by JOSE or your javascript runtime`);
  }
  if (isJWK2) {
    return { format: "jwk", key, ...options };
  }
  return options ? { ...options, key } : key;
}

// node_modules/jose/dist/node/esm/runtime/sign.js
var crypto2 = __toESM(require("node:crypto"), 1);
var import_node_util = require("node:util");

// node_modules/jose/dist/node/esm/runtime/hmac_digest.js
function hmacDigest(alg) {
  switch (alg) {
    case "HS256":
      return "sha256";
    case "HS384":
      return "sha384";
    case "HS512":
      return "sha512";
    default:
      throw new JOSENotSupported(`alg ${alg} is not supported either by JOSE or your javascript runtime`);
  }
}

// node_modules/jose/dist/node/esm/runtime/get_sign_verify_key.js
var import_node_crypto5 = require("node:crypto");
function getSignVerifyKey(alg, key, usage) {
  if (key instanceof Uint8Array) {
    if (!alg.startsWith("HS")) {
      throw new TypeError(invalid_key_input_default(key, ...types3));
    }
    return (0, import_node_crypto5.createSecretKey)(key);
  }
  if (key instanceof import_node_crypto5.KeyObject) {
    return key;
  }
  if (isCryptoKey(key)) {
    checkSigCryptoKey(key, alg, usage);
    return import_node_crypto5.KeyObject.from(key);
  }
  if (isJWK(key)) {
    if (alg.startsWith("HS")) {
      return (0, import_node_crypto5.createSecretKey)(Buffer.from(key.k, "base64url"));
    }
    return key;
  }
  throw new TypeError(invalid_key_input_default(key, ...types3, "Uint8Array", "JSON Web Key"));
}

// node_modules/jose/dist/node/esm/runtime/sign.js
var oneShotSign = (0, import_node_util.promisify)(crypto2.sign);
var sign2 = async (alg, key, data) => {
  const k = getSignVerifyKey(alg, key, "sign");
  if (alg.startsWith("HS")) {
    const hmac = crypto2.createHmac(hmacDigest(alg), k);
    hmac.update(data);
    return hmac.digest();
  }
  return oneShotSign(dsaDigest(alg), data, keyForCrypto(alg, k));
};
var sign_default = sign2;

// node_modules/jose/dist/node/esm/runtime/verify.js
var oneShotVerify = (0, import_node_util2.promisify)(crypto3.verify);
var verify2 = async (alg, key, signature, data) => {
  const k = getSignVerifyKey(alg, key, "verify");
  if (alg.startsWith("HS")) {
    const expected = await sign_default(alg, k, data);
    const actual = signature;
    try {
      return crypto3.timingSafeEqual(actual, expected);
    } catch {
      return false;
    }
  }
  const algorithm = dsaDigest(alg);
  const keyInput = keyForCrypto(alg, k);
  try {
    return await oneShotVerify(algorithm, data, keyInput, signature);
  } catch {
    return false;
  }
};
var verify_default = verify2;

// node_modules/jose/dist/node/esm/jws/flattened/verify.js
async function flattenedVerify(jws, key, options) {
  if (!isObject(jws)) {
    throw new JWSInvalid("Flattened JWS must be an object");
  }
  if (jws.protected === void 0 && jws.header === void 0) {
    throw new JWSInvalid('Flattened JWS must have either of the "protected" or "header" members');
  }
  if (jws.protected !== void 0 && typeof jws.protected !== "string") {
    throw new JWSInvalid("JWS Protected Header incorrect type");
  }
  if (jws.payload === void 0) {
    throw new JWSInvalid("JWS Payload missing");
  }
  if (typeof jws.signature !== "string") {
    throw new JWSInvalid("JWS Signature missing or incorrect type");
  }
  if (jws.header !== void 0 && !isObject(jws.header)) {
    throw new JWSInvalid("JWS Unprotected Header incorrect type");
  }
  let parsedProt = {};
  if (jws.protected) {
    try {
      const protectedHeader = decode(jws.protected);
      parsedProt = JSON.parse(decoder.decode(protectedHeader));
    } catch {
      throw new JWSInvalid("JWS Protected Header is invalid");
    }
  }
  if (!is_disjoint_default(parsedProt, jws.header)) {
    throw new JWSInvalid("JWS Protected and JWS Unprotected Header Parameter names must be disjoint");
  }
  const joseHeader = {
    ...parsedProt,
    ...jws.header
  };
  const extensions = validate_crit_default(JWSInvalid, /* @__PURE__ */ new Map([["b64", true]]), options?.crit, parsedProt, joseHeader);
  let b64 = true;
  if (extensions.has("b64")) {
    b64 = parsedProt.b64;
    if (typeof b64 !== "boolean") {
      throw new JWSInvalid('The "b64" (base64url-encode payload) Header Parameter must be a boolean');
    }
  }
  const { alg } = joseHeader;
  if (typeof alg !== "string" || !alg) {
    throw new JWSInvalid('JWS "alg" (Algorithm) Header Parameter missing or invalid');
  }
  const algorithms = options && validate_algorithms_default("algorithms", options.algorithms);
  if (algorithms && !algorithms.has(alg)) {
    throw new JOSEAlgNotAllowed('"alg" (Algorithm) Header Parameter value not allowed');
  }
  if (b64) {
    if (typeof jws.payload !== "string") {
      throw new JWSInvalid("JWS Payload must be a string");
    }
  } else if (typeof jws.payload !== "string" && !(jws.payload instanceof Uint8Array)) {
    throw new JWSInvalid("JWS Payload must be a string or an Uint8Array instance");
  }
  let resolvedKey = false;
  if (typeof key === "function") {
    key = await key(parsedProt, jws);
    resolvedKey = true;
    checkKeyTypeWithJwk(alg, key, "verify");
    if (isJWK(key)) {
      key = await importJWK(key, alg);
    }
  } else {
    checkKeyTypeWithJwk(alg, key, "verify");
  }
  const data = concat(encoder.encode(jws.protected ?? ""), encoder.encode("."), typeof jws.payload === "string" ? encoder.encode(jws.payload) : jws.payload);
  let signature;
  try {
    signature = decode(jws.signature);
  } catch {
    throw new JWSInvalid("Failed to base64url decode the signature");
  }
  const verified = await verify_default(alg, key, signature, data);
  if (!verified) {
    throw new JWSSignatureVerificationFailed();
  }
  let payload;
  if (b64) {
    try {
      payload = decode(jws.payload);
    } catch {
      throw new JWSInvalid("Failed to base64url decode the payload");
    }
  } else if (typeof jws.payload === "string") {
    payload = encoder.encode(jws.payload);
  } else {
    payload = jws.payload;
  }
  const result = { payload };
  if (jws.protected !== void 0) {
    result.protectedHeader = parsedProt;
  }
  if (jws.header !== void 0) {
    result.unprotectedHeader = jws.header;
  }
  if (resolvedKey) {
    return { ...result, key };
  }
  return result;
}

// node_modules/jose/dist/node/esm/jws/compact/verify.js
async function compactVerify(jws, key, options) {
  if (jws instanceof Uint8Array) {
    jws = decoder.decode(jws);
  }
  if (typeof jws !== "string") {
    throw new JWSInvalid("Compact JWS must be a string or Uint8Array");
  }
  const { 0: protectedHeader, 1: payload, 2: signature, length } = jws.split(".");
  if (length !== 3) {
    throw new JWSInvalid("Invalid Compact JWS");
  }
  const verified = await flattenedVerify({ payload, protected: protectedHeader, signature }, key, options);
  const result = { payload: verified.payload, protectedHeader: verified.protectedHeader };
  if (typeof key === "function") {
    return { ...result, key: verified.key };
  }
  return result;
}

// node_modules/jose/dist/node/esm/lib/epoch.js
var epoch_default = (date) => Math.floor(date.getTime() / 1e3);

// node_modules/jose/dist/node/esm/lib/secs.js
var minute = 60;
var hour = minute * 60;
var day = hour * 24;
var week = day * 7;
var year = day * 365.25;
var REGEX = /^(\+|\-)? ?(\d+|\d+\.\d+) ?(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)(?: (ago|from now))?$/i;
var secs_default = (str) => {
  const matched = REGEX.exec(str);
  if (!matched || matched[4] && matched[1]) {
    throw new TypeError("Invalid time period format");
  }
  const value = parseFloat(matched[2]);
  const unit = matched[3].toLowerCase();
  let numericDate;
  switch (unit) {
    case "sec":
    case "secs":
    case "second":
    case "seconds":
    case "s":
      numericDate = Math.round(value);
      break;
    case "minute":
    case "minutes":
    case "min":
    case "mins":
    case "m":
      numericDate = Math.round(value * minute);
      break;
    case "hour":
    case "hours":
    case "hr":
    case "hrs":
    case "h":
      numericDate = Math.round(value * hour);
      break;
    case "day":
    case "days":
    case "d":
      numericDate = Math.round(value * day);
      break;
    case "week":
    case "weeks":
    case "w":
      numericDate = Math.round(value * week);
      break;
    default:
      numericDate = Math.round(value * year);
      break;
  }
  if (matched[1] === "-" || matched[4] === "ago") {
    return -numericDate;
  }
  return numericDate;
};

// node_modules/jose/dist/node/esm/lib/jwt_claims_set.js
var normalizeTyp = (value) => value.toLowerCase().replace(/^application\//, "");
var checkAudiencePresence = (audPayload, audOption) => {
  if (typeof audPayload === "string") {
    return audOption.includes(audPayload);
  }
  if (Array.isArray(audPayload)) {
    return audOption.some(Set.prototype.has.bind(new Set(audPayload)));
  }
  return false;
};
var jwt_claims_set_default = (protectedHeader, encodedPayload, options = {}) => {
  let payload;
  try {
    payload = JSON.parse(decoder.decode(encodedPayload));
  } catch {
  }
  if (!isObject(payload)) {
    throw new JWTInvalid("JWT Claims Set must be a top-level JSON object");
  }
  const { typ } = options;
  if (typ && (typeof protectedHeader.typ !== "string" || normalizeTyp(protectedHeader.typ) !== normalizeTyp(typ))) {
    throw new JWTClaimValidationFailed('unexpected "typ" JWT header value', payload, "typ", "check_failed");
  }
  const { requiredClaims = [], issuer, subject, audience, maxTokenAge } = options;
  const presenceCheck = [...requiredClaims];
  if (maxTokenAge !== void 0)
    presenceCheck.push("iat");
  if (audience !== void 0)
    presenceCheck.push("aud");
  if (subject !== void 0)
    presenceCheck.push("sub");
  if (issuer !== void 0)
    presenceCheck.push("iss");
  for (const claim of new Set(presenceCheck.reverse())) {
    if (!(claim in payload)) {
      throw new JWTClaimValidationFailed(`missing required "${claim}" claim`, payload, claim, "missing");
    }
  }
  if (issuer && !(Array.isArray(issuer) ? issuer : [issuer]).includes(payload.iss)) {
    throw new JWTClaimValidationFailed('unexpected "iss" claim value', payload, "iss", "check_failed");
  }
  if (subject && payload.sub !== subject) {
    throw new JWTClaimValidationFailed('unexpected "sub" claim value', payload, "sub", "check_failed");
  }
  if (audience && !checkAudiencePresence(payload.aud, typeof audience === "string" ? [audience] : audience)) {
    throw new JWTClaimValidationFailed('unexpected "aud" claim value', payload, "aud", "check_failed");
  }
  let tolerance;
  switch (typeof options.clockTolerance) {
    case "string":
      tolerance = secs_default(options.clockTolerance);
      break;
    case "number":
      tolerance = options.clockTolerance;
      break;
    case "undefined":
      tolerance = 0;
      break;
    default:
      throw new TypeError("Invalid clockTolerance option type");
  }
  const { currentDate } = options;
  const now = epoch_default(currentDate || /* @__PURE__ */ new Date());
  if ((payload.iat !== void 0 || maxTokenAge) && typeof payload.iat !== "number") {
    throw new JWTClaimValidationFailed('"iat" claim must be a number', payload, "iat", "invalid");
  }
  if (payload.nbf !== void 0) {
    if (typeof payload.nbf !== "number") {
      throw new JWTClaimValidationFailed('"nbf" claim must be a number', payload, "nbf", "invalid");
    }
    if (payload.nbf > now + tolerance) {
      throw new JWTClaimValidationFailed('"nbf" claim timestamp check failed', payload, "nbf", "check_failed");
    }
  }
  if (payload.exp !== void 0) {
    if (typeof payload.exp !== "number") {
      throw new JWTClaimValidationFailed('"exp" claim must be a number', payload, "exp", "invalid");
    }
    if (payload.exp <= now - tolerance) {
      throw new JWTExpired('"exp" claim timestamp check failed', payload, "exp", "check_failed");
    }
  }
  if (maxTokenAge) {
    const age = now - payload.iat;
    const max = typeof maxTokenAge === "number" ? maxTokenAge : secs_default(maxTokenAge);
    if (age - tolerance > max) {
      throw new JWTExpired('"iat" claim timestamp check failed (too far in the past)', payload, "iat", "check_failed");
    }
    if (age < 0 - tolerance) {
      throw new JWTClaimValidationFailed('"iat" claim timestamp check failed (it should be in the past)', payload, "iat", "check_failed");
    }
  }
  return payload;
};

// node_modules/jose/dist/node/esm/jwt/verify.js
async function jwtVerify(jwt, key, options) {
  const verified = await compactVerify(jwt, key, options);
  if (verified.protectedHeader.crit?.includes("b64") && verified.protectedHeader.b64 === false) {
    throw new JWTInvalid("JWTs MUST NOT use unencoded payload");
  }
  const payload = jwt_claims_set_default(verified.protectedHeader, verified.payload, options);
  const result = { payload, protectedHeader: verified.protectedHeader };
  if (typeof key === "function") {
    return { ...result, key: verified.key };
  }
  return result;
}

// node_modules/jose/dist/node/esm/jwks/local.js
function getKtyFromAlg(alg) {
  switch (typeof alg === "string" && alg.slice(0, 2)) {
    case "RS":
    case "PS":
      return "RSA";
    case "ES":
      return "EC";
    case "Ed":
      return "OKP";
    default:
      throw new JOSENotSupported('Unsupported "alg" value for a JSON Web Key Set');
  }
}
function isJWKSLike(jwks) {
  return jwks && typeof jwks === "object" && Array.isArray(jwks.keys) && jwks.keys.every(isJWKLike);
}
function isJWKLike(key) {
  return isObject(key);
}
function clone(obj) {
  if (typeof structuredClone === "function") {
    return structuredClone(obj);
  }
  return JSON.parse(JSON.stringify(obj));
}
var LocalJWKSet = class {
  _jwks;
  _cached = /* @__PURE__ */ new WeakMap();
  constructor(jwks) {
    if (!isJWKSLike(jwks)) {
      throw new JWKSInvalid("JSON Web Key Set malformed");
    }
    this._jwks = clone(jwks);
  }
  async getKey(protectedHeader, token) {
    const { alg, kid } = { ...protectedHeader, ...token?.header };
    const kty = getKtyFromAlg(alg);
    const candidates = this._jwks.keys.filter((jwk2) => {
      let candidate = kty === jwk2.kty;
      if (candidate && typeof kid === "string") {
        candidate = kid === jwk2.kid;
      }
      if (candidate && typeof jwk2.alg === "string") {
        candidate = alg === jwk2.alg;
      }
      if (candidate && typeof jwk2.use === "string") {
        candidate = jwk2.use === "sig";
      }
      if (candidate && Array.isArray(jwk2.key_ops)) {
        candidate = jwk2.key_ops.includes("verify");
      }
      if (candidate) {
        switch (alg) {
          case "ES256":
            candidate = jwk2.crv === "P-256";
            break;
          case "ES256K":
            candidate = jwk2.crv === "secp256k1";
            break;
          case "ES384":
            candidate = jwk2.crv === "P-384";
            break;
          case "ES512":
            candidate = jwk2.crv === "P-521";
            break;
          case "Ed25519":
            candidate = jwk2.crv === "Ed25519";
            break;
          case "EdDSA":
            candidate = jwk2.crv === "Ed25519" || jwk2.crv === "Ed448";
            break;
        }
      }
      return candidate;
    });
    const { 0: jwk, length } = candidates;
    if (length === 0) {
      throw new JWKSNoMatchingKey();
    }
    if (length !== 1) {
      const error = new JWKSMultipleMatchingKeys();
      const { _cached } = this;
      error[Symbol.asyncIterator] = async function* () {
        for (const jwk2 of candidates) {
          try {
            yield await importWithAlgCache(_cached, jwk2, alg);
          } catch {
          }
        }
      };
      throw error;
    }
    return importWithAlgCache(this._cached, jwk, alg);
  }
};
async function importWithAlgCache(cache, jwk, alg) {
  const cached = cache.get(jwk) || cache.set(jwk, {}).get(jwk);
  if (cached[alg] === void 0) {
    const key = await importJWK({ ...jwk, ext: true }, alg);
    if (key instanceof Uint8Array || key.type !== "public") {
      throw new JWKSInvalid("JSON Web Key Set members must be public keys");
    }
    cached[alg] = key;
  }
  return cached[alg];
}
function createLocalJWKSet(jwks) {
  const set = new LocalJWKSet(jwks);
  const localJWKSet = async (protectedHeader, token) => set.getKey(protectedHeader, token);
  Object.defineProperties(localJWKSet, {
    jwks: {
      value: () => clone(set._jwks),
      enumerable: true,
      configurable: false,
      writable: false
    }
  });
  return localJWKSet;
}

// node_modules/jose/dist/node/esm/runtime/fetch_jwks.js
var http = __toESM(require("node:http"), 1);
var https = __toESM(require("node:https"), 1);
var import_node_events = require("node:events");
var fetchJwks = async (url, timeout, options) => {
  let get3;
  switch (url.protocol) {
    case "https:":
      get3 = https.get;
      break;
    case "http:":
      get3 = http.get;
      break;
    default:
      throw new TypeError("Unsupported URL protocol.");
  }
  const { agent, headers } = options;
  const req = get3(url.href, {
    agent,
    timeout,
    headers
  });
  const [response] = await Promise.race([(0, import_node_events.once)(req, "response"), (0, import_node_events.once)(req, "timeout")]);
  if (!response) {
    req.destroy();
    throw new JWKSTimeout();
  }
  if (response.statusCode !== 200) {
    throw new JOSEError("Expected 200 OK from the JSON Web Key Set HTTP response");
  }
  const parts = [];
  for await (const part of response) {
    parts.push(part);
  }
  try {
    return JSON.parse(decoder.decode(concat(...parts)));
  } catch {
    throw new JOSEError("Failed to parse the JSON Web Key Set HTTP response as JSON");
  }
};
var fetch_jwks_default = fetchJwks;

// node_modules/jose/dist/node/esm/jwks/remote.js
function isCloudflareWorkers() {
  return typeof WebSocketPair !== "undefined" || typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers" || typeof EdgeRuntime !== "undefined" && EdgeRuntime === "vercel";
}
var USER_AGENT;
if (typeof navigator === "undefined" || !navigator.userAgent?.startsWith?.("Mozilla/5.0 ")) {
  const NAME = "jose";
  const VERSION = "v5.10.0";
  USER_AGENT = `${NAME}/${VERSION}`;
}
var jwksCache = Symbol();
function isFreshJwksCache(input, cacheMaxAge) {
  if (typeof input !== "object" || input === null) {
    return false;
  }
  if (!("uat" in input) || typeof input.uat !== "number" || Date.now() - input.uat >= cacheMaxAge) {
    return false;
  }
  if (!("jwks" in input) || !isObject(input.jwks) || !Array.isArray(input.jwks.keys) || !Array.prototype.every.call(input.jwks.keys, isObject)) {
    return false;
  }
  return true;
}
var RemoteJWKSet = class {
  _url;
  _timeoutDuration;
  _cooldownDuration;
  _cacheMaxAge;
  _jwksTimestamp;
  _pendingFetch;
  _options;
  _local;
  _cache;
  constructor(url, options) {
    if (!(url instanceof URL)) {
      throw new TypeError("url must be an instance of URL");
    }
    this._url = new URL(url.href);
    this._options = { agent: options?.agent, headers: options?.headers };
    this._timeoutDuration = typeof options?.timeoutDuration === "number" ? options?.timeoutDuration : 5e3;
    this._cooldownDuration = typeof options?.cooldownDuration === "number" ? options?.cooldownDuration : 3e4;
    this._cacheMaxAge = typeof options?.cacheMaxAge === "number" ? options?.cacheMaxAge : 6e5;
    if (options?.[jwksCache] !== void 0) {
      this._cache = options?.[jwksCache];
      if (isFreshJwksCache(options?.[jwksCache], this._cacheMaxAge)) {
        this._jwksTimestamp = this._cache.uat;
        this._local = createLocalJWKSet(this._cache.jwks);
      }
    }
  }
  coolingDown() {
    return typeof this._jwksTimestamp === "number" ? Date.now() < this._jwksTimestamp + this._cooldownDuration : false;
  }
  fresh() {
    return typeof this._jwksTimestamp === "number" ? Date.now() < this._jwksTimestamp + this._cacheMaxAge : false;
  }
  async getKey(protectedHeader, token) {
    if (!this._local || !this.fresh()) {
      await this.reload();
    }
    try {
      return await this._local(protectedHeader, token);
    } catch (err) {
      if (err instanceof JWKSNoMatchingKey) {
        if (this.coolingDown() === false) {
          await this.reload();
          return this._local(protectedHeader, token);
        }
      }
      throw err;
    }
  }
  async reload() {
    if (this._pendingFetch && isCloudflareWorkers()) {
      this._pendingFetch = void 0;
    }
    const headers = new Headers(this._options.headers);
    if (USER_AGENT && !headers.has("User-Agent")) {
      headers.set("User-Agent", USER_AGENT);
      this._options.headers = Object.fromEntries(headers.entries());
    }
    this._pendingFetch ||= fetch_jwks_default(this._url, this._timeoutDuration, this._options).then((json) => {
      this._local = createLocalJWKSet(json);
      if (this._cache) {
        this._cache.uat = Date.now();
        this._cache.jwks = json;
      }
      this._jwksTimestamp = Date.now();
      this._pendingFetch = void 0;
    }).catch((err) => {
      this._pendingFetch = void 0;
      throw err;
    });
    await this._pendingFetch;
  }
};
function createRemoteJWKSet(url, options) {
  const set = new RemoteJWKSet(url, options);
  const remoteJWKSet = async (protectedHeader, token) => set.getKey(protectedHeader, token);
  Object.defineProperties(remoteJWKSet, {
    coolingDown: {
      get: () => set.coolingDown(),
      enumerable: true,
      configurable: false
    },
    fresh: {
      get: () => set.fresh(),
      enumerable: true,
      configurable: false
    },
    reload: {
      value: () => set.reload(),
      enumerable: true,
      configurable: false,
      writable: false
    },
    reloading: {
      get: () => !!set._pendingFetch,
      enumerable: true,
      configurable: false
    },
    jwks: {
      value: () => set._local?.jwks(),
      enumerable: true,
      configurable: false,
      writable: false
    }
  });
  return remoteJWKSet;
}

// api/src/lib/auth.ts
var TENANT = process.env.ENTRA_TENANT_ID;
var API_AUDIENCE = process.env.API_AUDIENCE;
var ISSUER = `https://login.microsoftonline.com/${TENANT}/v2.0`;
var _jwks;
function getJwks() {
  if (!_jwks) {
    _jwks = createRemoteJWKSet(
      new URL(`https://login.microsoftonline.com/${TENANT}/discovery/v2.0/keys`)
    );
  }
  return _jwks;
}
var SUPERUSER_VALUES = ["CollisionSpike.Superuser", "CollisionSpike.Admin"];
function hasSuperuser(roles) {
  return roles.some((r) => SUPERUSER_VALUES.includes(r));
}
var HttpError = class extends Error {
  constructor(status, message2) {
    super(message2);
    this.status = status;
    this.name = "HttpError";
  }
};
function toErrorResponse(e, ctx) {
  if (e instanceof HttpError) {
    return { status: e.status, jsonBody: { error: e.message } };
  }
  ctx.error(e);
  return { status: 500, jsonBody: { error: "internal" } };
}
function audienceCandidates() {
  const a = API_AUDIENCE;
  if (!a) return [];
  const bare = a.startsWith("api://") ? a.slice("api://".length) : a;
  return [bare, `api://${bare}`];
}
async function authenticate(req) {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new HttpError(401, "Missing bearer token");
  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: ISSUER,
      audience: audienceCandidates()
    });
    return payload;
  } catch (e) {
    if (e instanceof errors_exports.JOSEError) {
      throw new HttpError(401, "Invalid or expired token");
    }
    throw e;
  }
}
function withRole(required, handler) {
  return async (req, ctx) => {
    try {
      const claims = await authenticate(req);
      const roles = claims.roles ?? [];
      const ok = required === "CollisionSpike.Superuser" ? hasSuperuser(roles) : roles.includes("CollisionSpike.User") || hasSuperuser(roles);
      if (!ok) return { status: 403, jsonBody: { error: "forbidden" } };
      return await handler(req, ctx, claims);
    } catch (e) {
      return toErrorResponse(e, ctx);
    }
  };
}

// node_modules/pg/esm/index.mjs
var import_lib = __toESM(require_lib2(), 1);
var Client = import_lib.default.Client;
var Pool = import_lib.default.Pool;
var Connection = import_lib.default.Connection;
var types4 = import_lib.default.types;
var Query = import_lib.default.Query;
var DatabaseError = import_lib.default.DatabaseError;
var escapeIdentifier = import_lib.default.escapeIdentifier;
var escapeLiteral = import_lib.default.escapeLiteral;
var Result = import_lib.default.Result;
var TypeOverrides = import_lib.default.TypeOverrides;
var defaults = import_lib.default.defaults;

// api/src/lib/db.ts
var _pool;
function getPool() {
  if (!_pool) {
    const appRole = (process.env.PGAPPROLE ?? "staff").replace(/[^a-z]/g, "") || "staff";
    _pool = new Pool({
      host: process.env.PGHOST,
      database: process.env.PGDATABASE,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      ssl: process.env.PGSSLMODE !== "disable" ? { rejectUnauthorized: false } : false,
      options: `-c app.role=${appRole}`,
      max: 10,
      idleTimeoutMillis: 3e4,
      connectionTimeoutMillis: 5e3
    });
    _pool.on("error", (err) => {
      console.error("[db] pool error", err);
    });
  }
  return _pool;
}
async function query(sql, params) {
  const result = await getPool().query(sql, params);
  return result.rows;
}
async function tx(fn) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const q = async (sql, params) => (await client.query(sql, params)).rows;
    const result = await fn(q);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
    }
    throw e;
  } finally {
    client.release();
  }
}

// api/src/lib/audit.ts
var AUDIT_ACTION = {
  graph_message_ingested: 1e8,
  graph_message_ingest_failed: 100000001,
  attachment_classified: 100000002,
  case_created: 100000003,
  case_attached: 100000004,
  duplicate_dropped: 100000005,
  duplicate_flagged: 100000006,
  provider_matched: 100000007,
  provider_unmatched: 100000008,
  parser_called: 100000009,
  parser_failed: 100000010,
  enrichment_called: 100000011,
  enrichment_failed: 100000012,
  status_changed: 100000013,
  jobsheet_imported: 100000014,
  eva_submitted: 100000015,
  box_synced: 100000016,
  corpus_record_changed: 100000017,
  inspection_override: 100000018,
  box_folder_created: 100000019,
  box_file_request_copied: 100000020,
  box_upload_received: 100000021,
  location_assist_confirmed: 100000022,
  chaser_sent: 100000023,
  inbound_classified: 100000024,
  inbound_routed: 100000025,
  case_disposed: 100000026,
  // Phase-8 staff triage state-change actions (work-todo-spike: email-management).
  inbound_dismissed: 100000027,
  inbound_actioned: 100000028,
  inbound_reopened: 100000029,
  // Superuser soft-remove of a case (work-todo-spike: ui-changes/delete-case).
  case_removed: 100000030,
  // Staff override of a classifier suggestion (work-todo-spike: suggested-tags-and-folders).
  inbound_reclassified: 100000031,
  // AI suggestion lifecycle (TKT-015 AI suggestion layer; gated by AI_ASSIST_ENABLED).
  // created = a model produced a suggestion; accepted/rejected = a human reviewed it.
  ai_suggestion_created: 100000032,
  ai_suggestion_accepted: 100000033,
  ai_suggestion_rejected: 100000034
};
var SEVERITY_CODE = {
  info: 1e8,
  warning: 100000001,
  error: 100000002
};
async function writeAudit(opts) {
  try {
    await query(
      `INSERT INTO audit_event
         (name, case_id, actor, action_code, severity_code, before, after, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
      [
        opts.summary,
        opts.caseId ?? null,
        opts.actor ?? null,
        opts.action,
        SEVERITY_CODE[opts.severity ?? "info"],
        opts.before !== void 0 ? JSON.stringify(opts.before) : null,
        opts.after !== void 0 ? JSON.stringify(opts.after) : null
      ]
    );
  } catch (err) {
    console.error("[audit] write failed", err);
  }
}
function actorFromClaims(claims) {
  const pick = (v) => typeof v === "string" && v.length > 0 ? v : void 0;
  return pick(claims.oid) ?? pick(claims.preferred_username) ?? pick(claims.name) ?? pick(claims.sub);
}

// packages/domain/dist/gates.js
var gates = {
  // Core feature gates (plan 10 §1.1, #1–#21 boolean set)
  pdfMapper: () => process.env.PDF_MAPPER_ENABLED === "true",
  // #1
  enrichment: () => process.env.ENRICHMENT_ENABLED === "true",
  // #2
  evaApi: () => process.env.EVA_API_ENABLED === "true",
  // #4
  azureMaps: () => process.env.AZURE_MAPS_ENABLED === "true",
  // #8
  valuation: () => process.env.VALUATION_ENABLED === "true",
  // #9
  copilot: () => process.env.COPILOT_ENABLED === "true",
  // #10
  azureVision: () => process.env.AZURE_VISION_ENABLED === "true",
  // #11
  ocrScannedPdf: () => process.env.OCR_SCANNED_PDF_ENABLED === "true",
  // #12
  plateOcr: () => process.env.PLATE_OCR_ENABLED === "true",
  // #13
  auditCases: () => process.env.AUDIT_CASES_ENABLED === "true",
  // #15
  locationAssist: () => process.env.LOCATION_ASSIST_ENABLED === "true",
  // #17
  chaserSend: () => process.env.CHASER_SEND_ENABLED === "true",
  // #19
  caseDisposition: () => process.env.CASE_DISPOSITION_ENABLED === "true",
  // #20
  emailAi: () => process.env.EMAIL_AI_ENABLED === "true",
  // #21
  // AI assistant suggestion layer (TKT-015) — default OFF. Gates the embedded AI
  // suggestion surface + the server-side model call path; honest no-op while off
  // OR while no model endpoint/deployment is configured (see aiAssistConfigured).
  aiAssist: () => process.env.AI_ASSIST_ENABLED === "true",
  // Box gates (Phase 7, ADR-0012) — all default off
  boxApi: () => process.env.BOX_API_ENABLED === "true",
  // #22
  boxFolderAtIntake: () => process.env.BOX_FOLDER_AT_INTAKE_ENABLED === "true",
  // #23
  boxFileRequest: () => process.env.BOX_FILEREQUEST_ENABLED === "true",
  // #24
  boxEmbed: () => process.env.BOX_EMBED_ENABLED === "true",
  // #25
  boxMetadata: () => process.env.BOX_METADATA_ENABLED === "true",
  // #26
  // String config vars (plan 10 §1.1, #3, #5, #14, #18, #27, #28)
  enrichmentApiBase: () => process.env.ENRICHMENT_API_BASE ?? "",
  // #3
  evaBaseUrl: () => process.env.EVA_BASE_URL ?? "",
  // #5
  valuationApiBase: () => process.env.VALUATION_API_BASE ?? "",
  // #14
  locationAssistApiBase: () => process.env.LOCATION_ASSIST_API_BASE ?? "",
  // #18
  boxFolderRootId: () => process.env.BOX_FOLDER_ROOT_ID ?? "",
  // #27
  boxFileRequestTemplateId: () => process.env.BOX_FILE_REQUEST_TEMPLATE_ID ?? "",
  // #28
  // AI model endpoint config (TKT-015). The server-side model call path is built but
  // dormant: digital-3339-resource has ZERO model deployments, so these are ABSENT in
  // live app-settings and the generate route stays an honest no-op until a model is
  // deployed + wired. Prefer managed-identity/keyless — no API key gate by design.
  aiModelEndpoint: () => process.env.AI_MODEL_ENDPOINT ?? "",
  aiModelDeployment: () => process.env.AI_MODEL_DEPLOYMENT ?? "",
  /**
   * Derived: location assist is only enabled when all three conditions are met.
   * Used by GET /api/gates/location-assist (plan 21 §21.2).
   */
  locationAssistEnabled: () => gates.locationAssist() && gates.azureMaps() && gates.locationAssistApiBase() !== "",
  /**
   * Derived: a model endpoint AND deployment are both configured. The AI generate
   * route requires this in ADDITION to the aiAssist() switch — gate ON but model
   * UNCONFIGURED is still an honest no-op (the live state today). Used by
   * GET /api/gates/ai-assist + the generate route's disabled-reason.
   */
  aiAssistConfigured: () => gates.aiModelEndpoint() !== "" && gates.aiModelDeployment() !== ""
};

// api/src/lib/functions-client.ts
async function callFn(baseUrl, fnKey, method, path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-functions-key": fnKey
    },
    ...body !== void 0 ? { body: JSON.stringify(body) } : {}
  });
  if (!res.ok) {
    throw new Error(`[functions-client] ${method} ${path} \u2192 ${res.status} ${await res.text().catch(() => "")}`);
  }
  return res.json();
}
async function callParser(body) {
  return callFn(
    process.env.PARSER_FN_URL,
    process.env.PARSER_FN_KEY,
    "POST",
    "/api/parse",
    body
  );
}
async function callLocationSuggest(body) {
  return callFn(
    process.env.LOCATION_SUGGEST_FN_URL,
    process.env.LOCATION_SUGGEST_FN_KEY,
    "POST",
    "/api/location-suggest",
    body
  );
}
async function callBoxListFolder(folderId, limit = 1e3, offset = 0) {
  const base = process.env.BOX_FN_URL;
  const key = process.env.BOX_FN_KEY;
  if (!base || !key) throw new Error("[functions-client] BOX_FN_URL/BOX_FN_KEY not configured");
  return callFn(
    base,
    key,
    "GET",
    `/api/box/folders/${encodeURIComponent(folderId)}/items?limit=${limit}&offset=${offset}`
  );
}
async function listBoxFolderNames(folderId) {
  const names = [];
  const limit = 1e3;
  let offset = 0;
  for (let page = 0; page < 20; page++) {
    const res = await callBoxListFolder(folderId, limit, offset);
    const entries = res.entries ?? [];
    for (const e of entries) if (e?.name) names.push(String(e.name));
    if (entries.length < limit) break;
    offset += limit;
  }
  return names;
}

// api/src/lib/mappers.ts
var CASE_SELECT = "SELECT c.*, wp.display_name AS provider_display, wp.principal_code AS provider_principal FROM case_ c LEFT JOIN work_provider wp ON wp.id = c.work_provider_id";
var pad = (n) => String(n).padStart(2, "0");
function toDmy(v) {
  if (v == null || v === "") return void 0;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return void 0;
    return `${pad(v.getDate())}/${pad(v.getMonth() + 1)}/${v.getFullYear()}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return s;
  return void 0;
}
function toIso(v) {
  if (v == null || v === "") return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString();
  return String(v);
}
function ageDaysFrom(createdAtDmy, now) {
  if (!createdAtDmy) return 0;
  const m = createdAtDmy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return 0;
  const created = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  const ms = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(created.getFullYear(), created.getMonth(), created.getDate());
  return Math.max(0, Math.round(ms / 864e5));
}
var EVA_COLUMN_BY_KEY = {
  workProvider: "eva_work_provider",
  vehicleModel: "eva_vehicle_model",
  claimantName: "eva_claimant_name",
  claimantTelephone: "eva_claimant_telephone",
  claimantEmail: "eva_claimant_email",
  dateOfLoss: "eva_date_of_loss",
  dateOfInstruction: "eva_date_of_instruction",
  accidentCircumstances: "eva_accident_circumstances",
  inspectionAddress: "eva_inspection_address",
  vatStatus: "eva_vat_status",
  mileage: "eva_mileage",
  mileageUnit: "eva_mileage_unit"
};
function provenanceRowToEvaField(value, row) {
  const sourceType = sourceTypeCodec.toName(row?.source_type_code) ?? "staff";
  const reviewState = reviewStateCodec.toName(row?.review_state_code) ?? "needs_review";
  const confidence = row?.confidence;
  return {
    value,
    reviewState,
    provenance: {
      sourceType,
      sourceLabel: row?.source_label ?? "Staff entry",
      ...confidence != null ? { confidence: Number(confidence) } : {}
    }
  };
}
function rowToEvaFields(rec, provenanceRows = []) {
  const byField = /* @__PURE__ */ new Map();
  for (const row of provenanceRows) {
    if (row.field_name) byField.set(String(row.field_name), row);
  }
  const out = {};
  for (const desc of EVA_FIELD_ORDER) {
    const value = rec[EVA_COLUMN_BY_KEY[desc.key]] ?? "";
    out[desc.key] = provenanceRowToEvaField(
      value,
      byField.get(desc.key)
    );
  }
  out.vatStatus = { ...out.vatStatus, value: out.vatStatus.value };
  out.mileageUnit = { ...out.mileageUnit, value: out.mileageUnit.value };
  return out;
}
function rowToOverviewFacts(rec) {
  const f = {};
  if (rec.ov_insured_name) f.insuredName = rec.ov_insured_name;
  if (rec.ov_claimant_name) f.claimantName = rec.ov_claimant_name;
  if (rec.ov_third_party_name) f.thirdPartyName = rec.ov_third_party_name;
  if (rec.ov_claim_number) f.claimNumber = rec.ov_claim_number;
  if (rec.ov_policy_reference) f.policyReference = rec.ov_policy_reference;
  if (rec.ov_incident_date) f.incidentDate = rec.ov_incident_date;
  if (rec.ov_claim_type) f.claimType = rec.ov_claim_type;
  if (rec.ov_insurer_name) f.insurerName = rec.ov_insurer_name;
  if (rec.ov_repairer_name) f.repairerName = rec.ov_repairer_name;
  return f;
}
function deriveInspectionDecision(rec) {
  const explicit = inspectionDecisionCodec.toName(rec.inspection_decision_code);
  if (explicit) return explicit;
  if ((rec.eva_inspection_address ?? "").trim() === "Image Based Assessment") {
    return "image_based";
  }
  return "unknown";
}
function rowToCase(rec, opts = {}) {
  const now = opts.now ?? /* @__PURE__ */ new Date();
  const createdAt = toDmy(rec.created_at) ?? "";
  const channelKind = intakeChannelKindCodec.toName(rec.intake_channel_kind_code) ?? "email";
  const actionReason = actionReasonCodec.toName(rec.action_reason_code ?? void 0);
  const dateDue = toDmy(rec.date_due);
  const submittedAt = toDmy(rec.submitted_at);
  return {
    id: rec.id ?? "",
    vrm: rec.vrm ?? "",
    ...rec.case_po ? { casePo: rec.case_po } : {},
    ...rec.eva_claimant_address ? { claimantAddress: rec.eva_claimant_address } : {},
    provider: rec.provider_display ?? rec.eva_work_provider ?? "",
    providerCode: rec.provider_principal ?? "",
    vehicleModel: rec.eva_vehicle_model ?? "",
    evaFields: rowToEvaFields(rec, opts.provenanceRows),
    evidence: opts.evidence ?? [],
    notes: opts.notes ?? [],
    chasers: opts.chasers ?? [],
    overviewFacts: rowToOverviewFacts(rec),
    status: caseStatusCodec.toName(rec.status_code) ?? "error",
    missing: [],
    ...actionReason ? { actionReason } : {},
    ...rec.on_hold ? { onHold: true } : {},
    channel: {
      kind: channelKind,
      mode: rec.intake_channel_manual ? "manual" : "auto",
      sourceMailbox: rec.source_mailbox ?? ""
    },
    ageDays: ageDaysFrom(createdAt, now),
    inspectionDecision: deriveInspectionDecision(rec),
    createdAt,
    ...dateDue ? { dateDue } : {},
    ...submittedAt ? { submittedAt } : {},
    ...rec.box_folder_id ? { boxFolderId: rec.box_folder_id } : {},
    ...rec.box_folder_url ? { boxFolderUrl: rec.box_folder_url } : {}
  };
}
function rowToEvidence(rec) {
  return {
    id: rec.id ?? "",
    fileName: rec.file_name ?? "",
    kind: evidenceKindCodec.toName(rec.kind_code) ?? "other",
    imageRole: imageRoleCodec.toName(rec.image_role_code) ?? "unknown",
    registrationVisible: rec.registration_visible ?? false,
    acceptedForEva: rec.accepted_for_eva ?? false,
    ...rec.excluded != null ? { excluded: rec.excluded } : {},
    ...rec.exclusion_reason ? { exclusionReason: rec.exclusion_reason } : {},
    sourceLabel: rec.source_label ?? "",
    ...rec.box_file_id ? { boxFileId: rec.box_file_id } : {},
    ...rec.box_file_url ? { boxFileUrl: rec.box_file_url } : {}
  };
}
function parseDomains(raw) {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) return arr.map((d) => String(d).trim()).filter(Boolean);
    } catch {
    }
  }
  return trimmed.split(/[\r\n,]+/).map((d) => d.trim()).filter(Boolean);
}
function rowToProvider(rec) {
  return {
    id: rec.id ?? "",
    displayName: rec.display_name ?? "",
    principalCode: rec.principal_code ?? "",
    defaultMailbox: rec.default_mailbox ?? "",
    knownEmailDomains: parseDomains(rec.known_email_domains),
    inspectionLocationPolicy: inspectionPolicyCodec.toName(rec.inspection_location_policy_code) ?? "prefer_address",
    providerAutomationMode: automationModeCodec.toName(rec.provider_automation_mode_code) ?? "review_auto",
    active: rec.active ?? false
  };
}
function isSuggestedAddressRow(rec) {
  return (rec.source_label ?? "").trim().toLowerCase().startsWith("suggested");
}
function noteToken(note, key) {
  if (!note) return void 0;
  const m = note.match(new RegExp(`${key}=([^\\s|]+)`));
  return m ? m[1] : void 0;
}
function rowToSuggestedAddress(rec) {
  const lines = [
    rec.address_line1,
    rec.address_line2,
    rec.address_line3,
    rec.address_line4,
    rec.address_line5,
    rec.address_line6
  ].map((l) => (l ?? "").trim()).filter((l) => l.length > 0);
  const label = (rec.source_label ?? "").trim();
  const colon = label.indexOf(":");
  const confidenceBand = colon >= 0 ? label.slice(colon + 1).trim() : void 0;
  const note = rec.source_note ?? void 0;
  const humanEvidence = note ? note.replace(/\b(?:provider|loc|status)=\S*/gi, "").replace(/\bsource=/gi, "").replace(/\s{2,}/g, " ").replace(/\s+([.,])/g, "$1").replace(/\.{2,}/g, ".").trim() : "";
  const lastSeen = toIso(rec.last_seen_on).slice(0, 10);
  return {
    id: rec.id ?? "",
    lines,
    postcode: (rec.postcode ?? "").trim(),
    ...noteToken(note, "provider") ? { providerCode: noteToken(note, "provider") } : {},
    ...noteToken(note, "loc") ? { locValue: noteToken(note, "loc") } : {},
    ...humanEvidence ? { evidenceNote: humanEvidence } : {},
    ...confidenceBand ? { confidenceBand } : {},
    ...rec.suggestion_frequency != null ? { frequency: Number(rec.suggestion_frequency) } : {},
    ...lastSeen ? { lastSeen } : {},
    ...rec.suggestion_rank != null ? { rank: Number(rec.suggestion_rank) } : {}
  };
}
function sortSuggestions(list) {
  return list.map((s, i) => ({ s, i })).sort((a, b) => {
    const ra = a.s.rank;
    const rb = b.s.rank;
    if (ra != null && rb != null && ra !== rb) return ra - rb;
    if (ra != null && rb == null) return -1;
    if (ra == null && rb != null) return 1;
    const fa = a.s.frequency ?? 0;
    const fb = b.s.frequency ?? 0;
    if (fa !== fb) return fb - fa;
    const la = a.s.lastSeen ?? "";
    const lb = b.s.lastSeen ?? "";
    if (la !== lb) return lb < la ? -1 : 1;
    return a.i - b.i;
  }).map((x) => x.s);
}
function formatOccurredAt(v) {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return typeof v === "string" ? v : "";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function rowToActivityEvent(rec) {
  const action = auditActionCodec.toName(
    rec.action_code == null ? void 0 : Number(rec.action_code)
  );
  return {
    id: rec.id ?? "",
    caseId: rec.case_id ?? "",
    vrm: "",
    kind: auditActionToActivityKind(action),
    actor: rec.actor ?? "System",
    timestamp: formatOccurredAt(rec.occurred_at),
    description: rec.name ?? rec.after ?? action ?? ""
  };
}
var INBOUND_CATEGORY_BY_INT = {
  1e8: "receiving_work",
  100000001: "query",
  100000002: "other"
};
var INBOUND_CATEGORY_TO_INT = {
  receiving_work: 1e8,
  query: 100000001,
  other: 100000002
};
var INBOUND_SUBTYPE_BY_INT = {
  1e8: "existing_provider_instruction",
  100000001: "existing_provider_audit",
  100000002: "new_client_work",
  100000003: "query_existing_work",
  100000004: "query_new_enquiry",
  100000005: "other",
  100000006: "existing_provider_diminution"
};
var INBOUND_SUBTYPE_TO_INT = {
  existing_provider_instruction: 1e8,
  existing_provider_audit: 100000001,
  new_client_work: 100000002,
  query_existing_work: 100000003,
  query_new_enquiry: 100000004,
  other: 100000005,
  existing_provider_diminution: 100000006
};
var TRIAGE_STATES = ["new", "routed", "actioned", "dismissed"];
var CLASSIFIER_MODES = ["deterministic", "llm", "human"];
function isValidTriageState(s) {
  return typeof s === "string" && TRIAGE_STATES.includes(s);
}
function isHandledTriageState(s) {
  return s === "actioned" || s === "dismissed";
}
function inboundCategoryFromInt(v) {
  return v == null ? void 0 : INBOUND_CATEGORY_BY_INT[v];
}
function inboundSubtypeFromInt(v) {
  return v == null ? void 0 : INBOUND_SUBTYPE_BY_INT[v];
}
function parseSignals(memo) {
  const s = (memo ?? "").trim();
  if (!s) return [];
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr.map((x) => String(x)).filter(Boolean);
    } catch {
    }
  }
  return s.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
}
function rowToInboundEmail(rec) {
  const triageState = TRIAGE_STATES.includes(
    rec.triage_state ?? ""
  ) ? rec.triage_state : "new";
  const classifierMode = CLASSIFIER_MODES.includes(
    rec.classifier_mode ?? ""
  ) ? rec.classifier_mode : "deterministic";
  return {
    id: rec.id ?? "",
    name: rec.name ?? "",
    sourceMessageId: rec.source_message_id ?? "",
    subject: rec.subject ?? "",
    fromAddress: rec.from_address ?? "",
    senderDomain: rec.sender_domain ?? "",
    sourceMailbox: rec.source_mailbox ?? "",
    receivedOn: toIso(rec.received_on),
    hasAttachments: rec.has_attachments ?? false,
    category: INBOUND_CATEGORY_BY_INT[rec.category_code ?? -1] ?? "other",
    subtype: INBOUND_SUBTYPE_BY_INT[rec.subtype_code ?? -1] ?? "other",
    confidence: rec.confidence != null ? Number(rec.confidence) : 0,
    classifierMode,
    signals: parseSignals(rec.signals),
    triageState,
    bodyVrm: rec.body_vrm ?? "",
    bodyCaseref: rec.body_caseref ?? "",
    bodyPreview: rec.body_preview ?? "",
    ...rec.case_id ? { caseId: rec.case_id } : {},
    ...rec.work_provider_id ? { workProviderId: rec.work_provider_id } : {},
    // The classifier's original suggestion (columns may be absent on a not-yet-migrated DB
    // — SELECT * simply omits them, so these stay undefined). work-todo-spike: suggested-tags.
    ...rec.suggested_category_code != null && INBOUND_CATEGORY_BY_INT[rec.suggested_category_code] ? { suggestedCategory: INBOUND_CATEGORY_BY_INT[rec.suggested_category_code] } : {},
    ...rec.suggested_subtype_code != null && INBOUND_SUBTYPE_BY_INT[rec.suggested_subtype_code] ? { suggestedSubtype: INBOUND_SUBTYPE_BY_INT[rec.suggested_subtype_code] } : {}
  };
}
var AI_REVIEW_STATES = [
  "pending",
  "accepted",
  "rejected",
  "superseded"
];
function isAiReviewState(s) {
  return typeof s === "string" && AI_REVIEW_STATES.includes(s);
}
function coerceJson(v) {
  if (typeof v !== "string") return v ?? null;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}
function rowToAiSuggestion(rec) {
  const reviewState = AI_REVIEW_STATES.includes(
    rec.review_state ?? ""
  ) ? rec.review_state : "pending";
  return {
    id: rec.id ?? "",
    ...rec.case_id ? { caseId: rec.case_id } : {},
    ...rec.evidence_id ? { evidenceId: rec.evidence_id } : {},
    ...rec.inbound_email_id ? { inboundEmailId: rec.inbound_email_id } : {},
    suggestionType: rec.suggestion_type ?? "",
    suggestedValue: coerceJson(rec.suggested_value),
    ...rec.rationale ? { rationale: rec.rationale } : {},
    ...rec.confidence != null ? { confidence: Number(rec.confidence) } : {},
    ...rec.model_version ? { modelVersion: rec.model_version } : {},
    reviewState,
    createdAt: toIso(rec.created_at),
    ...rec.reviewed_by ? { reviewedBy: rec.reviewed_by } : {},
    ...rec.reviewed_at ? { reviewedAt: toIso(rec.reviewed_at) } : {}
  };
}
function inboundViewWhere(view) {
  switch (view) {
    case "handled":
      return "triage_state IN ('actioned','dismissed')";
    case "all":
      return "";
    case "active":
    default:
      return "(triage_state IS NULL OR triage_state NOT IN ('actioned','dismissed'))";
  }
}
function tallyActiveInboundCounts(rows) {
  const counts = { receiving_work: 0, query: 0, other: 0, untriaged: 0 };
  for (const r of rows) {
    if (isHandledTriageState(r.triage_state)) continue;
    const cat = inboundCategoryFromInt(r.category_code ?? void 0);
    if (cat) counts[cat] += 1;
    if ((r.triage_state ?? "new") === "new") counts.untriaged += 1;
  }
  return counts;
}
function casePoSeqOfName(name, principal, yy) {
  const prefix = `${principal}${yy}`.toUpperCase();
  const up = String(name ?? "").trim().toUpperCase();
  if (!up.startsWith(prefix)) return 0;
  const tail = up.slice(prefix.length);
  if (!/^[0-9]{3,}$/.test(tail)) return 0;
  return Number.parseInt(tail, 10);
}
function maxCasePoSeqFromNames(names, principal, yy) {
  let max = 0;
  for (const n of names) {
    const seq = casePoSeqOfName(n, principal, yy);
    if (seq > max) max = seq;
  }
  return max;
}
function richTagToClassification(tag2) {
  switch (tag2) {
    case "Inspection":
      return { category: "receiving_work", subtype: "existing_provider_instruction" };
    case "Audit":
      return { category: "receiving_work", subtype: "existing_provider_audit" };
    case "Diminution":
      return { category: "receiving_work", subtype: "existing_provider_diminution" };
    case "Query":
      return { category: "query", subtype: "query_existing_work" };
    default:
      return void 0;
  }
}
function parseDmy(s) {
  if (!s) return void 0;
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return void 0;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}
function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function isSameDay(a, b) {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function daysBetween(from, to) {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 864e5);
}
function startOfWeek(d) {
  const s = startOfDay(d);
  const dow = (s.getDay() + 6) % 7;
  s.setDate(s.getDate() - dow);
  return s;
}
function filterQueue(all, name) {
  if (!queueByName(name)) return [];
  return all.filter((c) => (c.onHold ? "held" : statusToQueue(c.status)) === name);
}
function actionableCases(all) {
  return [
    ...filterQueue(all, "not-ready"),
    ...filterQueue(all, "review"),
    ...filterQueue(all, "held")
  ];
}
var TWIN_TERMINAL = /* @__PURE__ */ new Set([
  "eva_submitted",
  "box_synced",
  "removed"
]);

// api/src/functions/cases.ts
var pad2 = (n) => String(n).padStart(2, "0");
function fmtTimestamp(v) {
  if (v == null || v === "") return "";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function chaserTargetType(code) {
  if (code === 1e8) return "image_source";
  if (code === 100000001) return "repairer";
  return "work_provider";
}
async function loadAllCases(now) {
  const rows = await query(`${CASE_SELECT} ORDER BY c.created_at DESC`);
  return rows.map((r) => rowToCase(r, { now }));
}
async function loadCaseFull(id, now) {
  const rows = await query(`${CASE_SELECT} WHERE c.id = $1`, [id]);
  const rec = rows[0];
  if (!rec) return void 0;
  const [prov, ev, notes, chasers] = await Promise.all([
    query("SELECT * FROM field_level_provenance WHERE case_id = $1", [id]),
    query("SELECT * FROM evidence WHERE case_id = $1 ORDER BY sequence_index NULLS LAST, created_at", [id]),
    query("SELECT * FROM note WHERE case_id = $1 ORDER BY occurred_at", [id]),
    query("SELECT * FROM chaser WHERE case_id = $1 ORDER BY created_at", [id])
  ]);
  return rowToCase(rec, {
    now,
    provenanceRows: prov,
    evidence: ev.map(rowToEvidence),
    notes: notes.map((n) => ({
      id: n.id ?? "",
      author: n.author ?? "",
      timestamp: fmtTimestamp(n.occurred_at ?? n.created_at),
      text: n.text ?? ""
    })),
    chasers: chasers.map((ch) => ({
      id: ch.id ?? "",
      targetType: chaserTargetType(ch.target_type_code),
      targetName: ch.target_name ?? "",
      channel: ch.channel_code === 100000001 ? "whatsapp" : "email",
      templateUsed: ch.template_used ?? "",
      status: "drafted",
      summary: ch.name ?? "",
      createdAt: fmtTimestamp(ch.drafted_at ?? ch.created_at),
      ...ch.sent_by ? { sentBy: ch.sent_by } : {},
      ...ch.sent_at ? { sentAt: fmtTimestamp(ch.sent_at) } : {}
    }))
  });
}
async function loadCaseLite(id) {
  const rows = await query(`${CASE_SELECT} WHERE c.id = $1`, [id]);
  return rows[0] ? rowToCase(rows[0]) : void 0;
}
async function recomputeStatus(caseId, actor) {
  const full = await loadCaseFull(caseId, /* @__PURE__ */ new Date());
  if (!full) return;
  const input = {
    status: full.status,
    evaFields: full.evaFields,
    evidence: full.evidence,
    instructionCount: full.evidence.filter((e) => e.kind === "instruction").length,
    hasIdentity: full.vrm.trim().length > 0 || full.providerCode.trim().length > 0 || full.evaFields.claimantName.value.trim().length > 0
  };
  const next = statusForReviewCase(input);
  if (next === full.status) return;
  await query("UPDATE case_ SET status_code = $2, updated_at = now() WHERE id = $1", [
    caseId,
    statusToInt(next)
  ]);
  await writeAudit({
    action: AUDIT_ACTION.status_changed,
    caseId,
    summary: `Status ${full.status} -> ${next}`,
    before: { status: full.status },
    after: { status: next },
    ...actor ? { actor } : {}
  });
}
var EVA_MAXLEN = {
  workProvider: 200,
  vehicleModel: 200,
  claimantName: 200,
  claimantTelephone: 60,
  claimantEmail: 320,
  dateOfLoss: 10,
  dateOfInstruction: 10,
  accidentCircumstances: 4e3,
  inspectionAddress: 2e3,
  vatStatus: 3,
  mileage: 20,
  mileageUnit: 6
};
var isDmyOrEmpty = (v) => v === "" || /^\d{2}\/\d{2}\/\d{4}$/.test(v);
var VAT_VALUES = /* @__PURE__ */ new Set(["", "Yes", "No"]);
var MILEAGE_UNITS = /* @__PURE__ */ new Set(["", "Miles", "Km"]);
function normaliseEvaEdit(key, raw) {
  const trimmed = raw.trim();
  if (key === "dateOfLoss" || key === "dateOfInstruction") {
    if (!isDmyOrEmpty(trimmed)) return { error: `${key} must be DD/MM/YYYY or empty` };
    return { value: trimmed };
  }
  if (key === "vatStatus") {
    if (!VAT_VALUES.has(trimmed)) return { error: "vatStatus must be '', 'Yes' or 'No'" };
    return { value: trimmed };
  }
  if (key === "mileageUnit") {
    if (!MILEAGE_UNITS.has(trimmed)) return { error: "mileageUnit must be '', 'Miles' or 'Km'" };
    return { value: trimmed };
  }
  return { value: raw.slice(0, EVA_MAXLEN[key]) };
}
async function upsertManualProvenance(caseId, fieldName, value) {
  try {
    const staff = sourceTypeCodec.toInt("staff") ?? 1e8;
    const reviewed = reviewStateCodec.toInt("reviewed") ?? 100000002;
    const upd = await query(
      `UPDATE field_level_provenance
          SET value = $3, source_type_code = $4, source_label = 'Manual edit (case page)',
              review_state_code = $5, updated_at = now()
        WHERE case_id = $1 AND field_name = $2
        RETURNING id`,
      [caseId, fieldName, value, staff, reviewed]
    );
    if (upd.length === 0) {
      await query(
        `INSERT INTO field_level_provenance
           (name, case_id, field_name, value, source_type_code, source_label, review_state_code)
         VALUES ($1, $2, $3, $4, $5, 'Manual edit (case page)', $6)`,
        [`${caseId}:${fieldName}`, caseId, fieldName, value, staff, reviewed]
      );
    }
  } catch {
  }
}
import_functions.app.http("caseById", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "cases/{id}",
  handler: withRole("CollisionSpike.User", async (req) => {
    const id = req.params.id;
    const c = await loadCaseFull(id, /* @__PURE__ */ new Date());
    if (!c) return { status: 404, jsonBody: { error: "not found" } };
    return { status: 200, jsonBody: c };
  })
});
import_functions.app.http("patchCase", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "cases/{id}",
  handler: withRole("CollisionSpike.User", async (req, _ctx, claims) => {
    const id = req.params.id;
    const body = await req.json().catch(() => ({}));
    const actor = actorFromClaims(claims);
    const existing = await loadCaseLite(id);
    if (!existing) return { status: 404, jsonBody: { error: "not found" } };
    const sets = [];
    const vals = [];
    const before = {};
    const after = {};
    const changedEvaFields = [];
    if (body.vrm !== void 0) {
      const raw = String(body.vrm ?? "").trim();
      const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
      const newVrm = raw ? extractVrm(raw) || cleaned : "";
      if (newVrm !== existing.vrm) {
        sets.push(`vrm = $${sets.length + 1}`);
        vals.push(newVrm);
        before.vrm = existing.vrm;
        after.vrm = newVrm;
      }
    }
    if (body.evaFields && typeof body.evaFields === "object") {
      for (const [k, rawVal] of Object.entries(body.evaFields)) {
        if (rawVal === void 0 || !(k in EVA_COLUMN_BY_KEY)) continue;
        const key = k;
        const norm = normaliseEvaEdit(key, String(rawVal ?? ""));
        if ("error" in norm) return { status: 400, jsonBody: { error: norm.error } };
        const oldVal = existing.evaFields[key]?.value ?? "";
        if (norm.value === oldVal) continue;
        sets.push(`${EVA_COLUMN_BY_KEY[key]} = $${sets.length + 1}`);
        vals.push(norm.value);
        before[key] = oldVal;
        after[key] = norm.value;
        changedEvaFields.push({ key, value: norm.value });
      }
    }
    if (sets.length === 0) {
      const cur = await loadCaseFull(id, /* @__PURE__ */ new Date());
      return { status: 200, jsonBody: cur };
    }
    vals.push(id);
    await query(
      `UPDATE case_ SET ${sets.join(", ")}, updated_at = now() WHERE id = $${vals.length}`,
      vals
    );
    for (const f of changedEvaFields) await upsertManualProvenance(id, f.key, f.value);
    await writeAudit({
      action: AUDIT_ACTION.status_changed,
      caseId: id,
      summary: `Case edited: ${Object.keys(after).join(", ")}`,
      before,
      after,
      ...actor ? { actor } : {}
    });
    await recomputeStatus(id, actor);
    const updated = await loadCaseFull(id, /* @__PURE__ */ new Date());
    return { status: 200, jsonBody: updated };
  })
});
import_functions.app.http("createCase", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "cases",
  handler: withRole("CollisionSpike.User", async (req, _ctx, claims) => {
    const input = await req.json();
    const actor = actorFromClaims(claims);
    const evalInput = {
      status: input.status,
      evaFields: input.evaFields,
      evidence: [],
      instructionCount: 0,
      hasIdentity: (input.vrm ?? "").trim().length > 0 || (input.providerCode ?? "").trim().length > 0 || input.evaFields.claimantName.value.trim().length > 0
    };
    const status = statusForReviewCase(evalInput);
    const name = [input.vrm, input.provider].filter((v) => v && v.trim()).join(" \xB7 ") || "Manual case";
    const cols = ["name", "vrm", "status_code", "intake_channel_kind_code", "intake_channel_manual", "source_mailbox"];
    const vals = [
      name,
      input.vrm ?? "",
      statusToInt(status),
      intakeChannelKindCodec.toInt("email") ?? null,
      true,
      input.sourceLabel ?? "Manual intake (Data API)"
    ];
    const add = (col, value) => {
      cols.push(col);
      vals.push(value);
    };
    const pcode = (input.providerCode ?? "").trim();
    if (pcode) {
      const wp = await query("SELECT id FROM work_provider WHERE principal_code = $1 LIMIT 1", [pcode]);
      if (wp[0]?.id) add("work_provider_id", wp[0].id);
    }
    const casePo = (input.casePo ?? "").trim().toUpperCase();
    if (casePo) add("case_po", casePo);
    if (input.onHold) add("on_hold", true);
    if (input.insuredName) add("ov_insured_name", input.insuredName);
    if (input.providerReference) add("ov_claim_number", input.providerReference);
    if (input.inspectionDecision && input.inspectionDecision !== "unknown") {
      add("inspection_decision_code", inspectionDecisionCodec.toInt(input.inspectionDecision) ?? null);
    }
    for (const desc of EVA_FIELD_ORDER) {
      add(EVA_COLUMN_BY_KEY[desc.key], input.evaFields[desc.key]?.value ?? "");
    }
    const placeholders = vals.map((_v, i) => `$${i + 1}`).join(", ");
    const rows = await query(
      `INSERT INTO case_ (${cols.join(", ")}) VALUES (${placeholders}) RETURNING id`,
      vals
    );
    const newId = rows[0]?.id;
    if (!newId) return { status: 500, jsonBody: { error: "case create returned no id" } };
    if (input.writeProvenance) {
      await Promise.all(
        EVA_FIELD_ORDER.map(async (desc) => {
          const field = input.evaFields[desc.key];
          try {
            await query(
              `INSERT INTO field_level_provenance
                 (name, case_id, field_name, value, source_type_code, source_label, confidence, review_state_code)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [
                `${newId}:${desc.key}`,
                newId,
                desc.key,
                field.value,
                sourceTypeCodec.toInt(field.provenance.sourceType) ?? 1e8,
                field.provenance.sourceLabel,
                field.provenance.confidence ?? null,
                reviewStateCodec.toInt(field.reviewState) ?? 100000001
              ]
            );
          } catch {
          }
        })
      );
    }
    if (input.inspectionDecisionReason?.trim()) {
      try {
        await query(
          "INSERT INTO note (name, case_id, author, text, occurred_at) VALUES ($1, $2, $3, $4, now())",
          [
            "Inspection decision",
            newId,
            "Manual intake (Data API)",
            `Inspection decision: image-based \u2014 ${input.inspectionDecisionReason.trim()}`
          ]
        );
      } catch {
      }
    }
    await writeAudit({
      action: AUDIT_ACTION.case_created,
      caseId: newId,
      summary: `Case created (${name})`,
      after: { status, vrm: input.vrm },
      ...actor ? { actor } : {}
    });
    return { status: 201, jsonBody: { id: newId } };
  })
});
import_functions.app.http("casesForQueue", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "queues/{name}/cases",
  handler: withRole("CollisionSpike.User", async (req) => {
    const name = req.params.name;
    const now = nowParam(req);
    const all = await loadAllCases(now);
    return { status: 200, jsonBody: filterQueue(all, name) };
  })
});
import_functions.app.http("openVrmTwins", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "cases",
  handler: withRole("CollisionSpike.User", async (req) => {
    const vrm = req.query.get("vrm") ?? "";
    const exclude = req.query.get("exclude") ?? void 0;
    if (!vrm) return { status: 200, jsonBody: [] };
    const rows = await query(`${CASE_SELECT} WHERE c.vrm = $1`, [vrm]);
    const twins = rows.map((r) => rowToCase(r)).filter((c) => !TWIN_TERMINAL.has(c.status) && c.id !== exclude);
    return { status: 200, jsonBody: twins };
  })
});
import_functions.app.http("setOnHold", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "cases/{id}/hold",
  handler: withRole("CollisionSpike.User", async (req, _ctx, claims) => {
    const id = req.params.id;
    const body = await req.json();
    await query("UPDATE case_ SET on_hold = $2, updated_at = now() WHERE id = $1", [id, body.onHold]);
    await writeAudit({
      action: AUDIT_ACTION.status_changed,
      caseId: id,
      summary: body.onHold ? "Case put on hold" : "Case taken off hold",
      after: { onHold: body.onHold },
      ...actorFromClaims(claims) ? { actor: actorFromClaims(claims) } : {}
    });
    return { status: 204 };
  })
});
import_functions.app.http("mergeCandidates", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "cases/{id}/merge-candidates",
  handler: withRole("CollisionSpike.User", async (req) => {
    const id = req.params.id;
    const self = await loadCaseLite(id);
    if (!self) return { status: 200, jsonBody: [] };
    const rows = await query(`${CASE_SELECT} ORDER BY c.created_at DESC`);
    const candidates = rows.map((r) => rowToCase(r)).filter(
      (cc) => cc.id !== id && !TWIN_TERMINAL.has(cc.status) && cc.status !== "linked_to_instruction" && cc.providerCode === self.providerCode
    );
    return { status: 200, jsonBody: candidates };
  })
});
import_functions.app.http("mergeCases", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "cases/{tgt}/merge",
  handler: withRole("CollisionSpike.User", async (req, _ctx, claims) => {
    const targetCaseId = req.params.tgt;
    const body = await req.json();
    const sourceCaseId = body.sourceCaseId;
    const actor = actorFromClaims(claims);
    if (!sourceCaseId || sourceCaseId === targetCaseId) {
      return { status: 400, jsonBody: { error: "Cannot merge a case into itself." } };
    }
    const [src, tgt] = await Promise.all([loadCaseLite(sourceCaseId), loadCaseLite(targetCaseId)]);
    if (!src || !tgt) return { status: 404, jsonBody: { error: "Source or target case not found." } };
    if (src.providerCode && tgt.providerCode && src.providerCode !== tgt.providerCode) {
      return { status: 400, jsonBody: { error: "Refusing to merge across different work providers." } };
    }
    if (TWIN_TERMINAL.has(tgt.status)) {
      return { status: 400, jsonBody: { error: "Cannot merge into a finalised (terminal) case." } };
    }
    const moved = await query(
      "UPDATE evidence SET case_id = $2, updated_at = now() WHERE case_id = $1 RETURNING id",
      [sourceCaseId, targetCaseId]
    );
    const movedEvidence = moved.length;
    await query(
      `UPDATE case_
         SET status_code = $2, duplicate_keys = $3, on_hold = false, updated_at = now()
       WHERE id = $1`,
      [sourceCaseId, statusToInt("linked_to_instruction"), JSON.stringify({ mergedInto: targetCaseId })]
    );
    await writeAudit({
      action: AUDIT_ACTION.case_attached,
      caseId: targetCaseId,
      summary: `Merged ${sourceCaseId} into ${targetCaseId} (${movedEvidence} evidence)`,
      after: { sourceCaseId, targetCaseId, movedEvidence },
      ...actor ? { actor } : {}
    });
    await recomputeStatus(targetCaseId, actor);
    const result = { targetCaseId, movedEvidence };
    return { status: 200, jsonBody: result };
  })
});
import_functions.app.http("imagesForCase", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "cases/{id}/images",
  handler: withRole("CollisionSpike.User", async (req) => {
    const id = req.params.id;
    const rows = await query(
      "SELECT * FROM evidence WHERE case_id = $1 AND kind_code = (SELECT code FROM choice_evidence_kind WHERE name = 'image') AND excluded <> true ORDER BY sequence_index NULLS LAST, created_at",
      [id]
    );
    return { status: 200, jsonBody: rows.map(rowToEvidence) };
  })
});
import_functions.app.http("recentActivity", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "activity",
  handler: withRole("CollisionSpike.User", async () => {
    const rows = await query("SELECT * FROM audit_event ORDER BY occurred_at DESC LIMIT 200");
    return { status: 200, jsonBody: rows.map(rowToActivityEvent) };
  })
});
import_functions.app.http("activityForCase", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "cases/{id}/activity",
  handler: withRole("CollisionSpike.User", async (req) => {
    const id = req.params.id;
    const rows = await query(
      "SELECT * FROM audit_event WHERE case_id = $1 ORDER BY occurred_at DESC",
      [id]
    );
    return { status: 200, jsonBody: rows.map(rowToActivityEvent) };
  })
});
import_functions.app.http("removeCase", {
  methods: ["DELETE"],
  authLevel: "anonymous",
  route: "cases/{id}",
  handler: withRole("CollisionSpike.Superuser", async (req, _ctx, claims) => {
    const id = req.params.id;
    const body = await req.json().catch(() => ({}));
    const actor = actorFromClaims(claims);
    const existing = await loadCaseLite(id);
    if (!existing) return { status: 404, jsonBody: { error: "not found" } };
    if (existing.status === "removed") {
      const done = {
        id,
        status: "removed",
        alreadyRemoved: true,
        ...existing.boxFolderUrl ? { boxFolderUrl: existing.boxFolderUrl } : {}
      };
      return { status: 200, jsonBody: done };
    }
    const before = {
      status: existing.status,
      vrm: existing.vrm,
      casePo: existing.casePo ?? null,
      provider: existing.provider,
      claimantName: existing.evaFields.claimantName.value
    };
    const evaCols = EVA_FIELD_ORDER.map((d) => `${EVA_COLUMN_BY_KEY[d.key]} = ''`).join(", ");
    await query(
      `UPDATE case_
          SET status_code = $2, ${evaCols},
              vrm = '', case_ref = '', name = '[removed]',
              ov_insured_name = NULL, ov_claimant_name = NULL,
              ov_third_party_name = NULL, ov_claim_number = NULL,
              ov_policy_reference = NULL, ov_incident_date = NULL,
              ov_insurer_name = NULL, ov_repairer_name = NULL,
              eva_claimant_address = NULL,
              on_hold = false, closed_at = now(), updated_at = now()
        WHERE id = $1`,
      [id, statusToInt("removed")]
    );
    await writeAudit({
      action: AUDIT_ACTION.case_removed,
      caseId: id,
      severity: "warning",
      summary: `Case removed (soft): ${before.vrm || before.casePo || id}`,
      before,
      after: {
        status: "removed",
        // The "also remove Box folder" tickbox is an INTENT FLAG only — no automated deletion.
        boxFolderAcknowledged: body.acknowledgeBoxFolderHandled === true,
        boxFolderId: existing.boxFolderId ?? null,
        boxFolderUrl: existing.boxFolderUrl ?? null,
        ...typeof body.reason === "string" && body.reason.trim() ? { reason: body.reason.trim() } : {}
      },
      ...actor ? { actor } : {}
    });
    const result = {
      id,
      status: "removed",
      alreadyRemoved: false,
      ...existing.boxFolderUrl ? { boxFolderUrl: existing.boxFolderUrl } : {}
    };
    return { status: 200, jsonBody: result };
  })
});
import_functions.app.http("nextCasePo", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "cases/next-po",
  handler: withRole("CollisionSpike.User", async (req, ctx) => {
    const principalRaw = (req.query.get("principal") ?? "").trim();
    if (!principalRaw) return { status: 400, jsonBody: { error: "principal is required" } };
    const principal = principalRaw.toUpperCase();
    if (!/^[A-Z][A-Z0-9]{0,7}$/.test(principal)) {
      return { status: 400, jsonBody: { error: "invalid principal code" } };
    }
    const yearParam = (req.query.get("year") ?? "").trim();
    const yy = /^\d{2}$/.test(yearParam) ? yearParam : /^\d{4}$/.test(yearParam) ? yearParam.slice(-2) : casePoYear();
    const prefix = `${principal}${yy}`;
    const seqRows = await query(
      `SELECT COALESCE(MAX(SUBSTRING(upper(case_po) FROM length($3) + 1)::int), 0) AS max_seq
         FROM case_
        WHERE upper(case_po) LIKE $1 AND upper(case_po) ~ $2`,
      [`${prefix}%`, casePoSequenceRegex(principal, yy), prefix]
    );
    let maxSeq = Number(seqRows[0]?.max_seq ?? 0);
    let source = "db";
    if (maxSeq === 0 && gates.boxApi() && gates.boxFolderRootId() && process.env.BOX_FN_URL) {
      try {
        const names = await listBoxFolderNames(gates.boxFolderRootId());
        const boxMax = maxCasePoSeqFromNames(names, principal, yy);
        if (boxMax > 0) {
          maxSeq = boxMax;
          source = "box";
        }
      } catch (e) {
        ctx.error(`[next-po] Box fallback failed: ${String(e)}`);
      }
    }
    const nextSeq = maxSeq + 1;
    const casePo = formatCasePo(principal, yy, nextSeq);
    const result = {
      principal,
      yy,
      seq: String(nextSeq).padStart(3, "0"),
      nextSeq,
      evaLower: casePo.toLowerCase(),
      boxUpper: casePo,
      source
    };
    return { status: 200, jsonBody: result };
  })
});
function nowParam(req) {
  const raw = req.query.get("now");
  if (!raw) return /* @__PURE__ */ new Date();
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? /* @__PURE__ */ new Date() : d;
}

// api/src/functions/providers.ts
var import_functions2 = require("@azure/functions");
import_functions2.app.http("providers", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "providers",
  handler: withRole("CollisionSpike.User", async () => {
    const rows = await query("SELECT * FROM work_provider ORDER BY display_name");
    return { status: 200, jsonBody: rows.map(rowToProvider) };
  })
});
import_functions2.app.http("providerByCode", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "providers/{code}",
  handler: withRole("CollisionSpike.User", async (req) => {
    const code = req.params.code;
    const rows = await query("SELECT * FROM work_provider WHERE principal_code = $1 LIMIT 1", [
      code
    ]);
    if (!rows[0]) return { status: 404, jsonBody: { error: "not found" } };
    return { status: 200, jsonBody: rowToProvider(rows[0]) };
  })
});
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function normaliseDomains(input) {
  if (!Array.isArray(input)) return void 0;
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const d of input) {
    const v = String(d ?? "").trim().toLowerCase();
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}
import_functions2.app.http("updateProvider", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "providers/{id}",
  handler: withRole("CollisionSpike.Superuser", async (req, _ctx, claims) => {
    const idOrCode = (req.params.id ?? "").trim();
    if (!idOrCode) return { status: 400, jsonBody: { error: "id is required" } };
    const body = await req.json().catch(() => ({}));
    let modeCode;
    if (body.providerAutomationMode !== void 0) {
      const mode = String(body.providerAutomationMode);
      const code = automationModeCodec.toInt(mode);
      if (code == null) return { status: 400, jsonBody: { error: "invalid providerAutomationMode" } };
      modeCode = code;
    }
    let domains;
    if (body.knownEmailDomains !== void 0) {
      domains = normaliseDomains(body.knownEmailDomains);
      if (domains === void 0) {
        return { status: 400, jsonBody: { error: "knownEmailDomains must be an array of strings" } };
      }
    }
    if (modeCode === void 0 && domains === void 0) {
      return { status: 400, jsonBody: { error: "nothing to update" } };
    }
    const where = UUID_RE.test(idOrCode) ? "id = $1" : "principal_code = $1";
    const existing = await query(`SELECT * FROM work_provider WHERE ${where} LIMIT 1`, [idOrCode]);
    if (!existing[0]) return { status: 404, jsonBody: { error: "not found" } };
    const beforeRow = existing[0];
    const sets = [];
    const vals = [];
    const before = {};
    const after = {};
    if (modeCode !== void 0) {
      vals.push(modeCode);
      sets.push(`provider_automation_mode_code = $${vals.length}`);
      before.providerAutomationMode = automationModeCodec.toName(beforeRow.provider_automation_mode_code) ?? null;
      after.providerAutomationMode = automationModeCodec.toName(modeCode);
    }
    if (domains !== void 0) {
      vals.push(domains.join("\n"));
      sets.push(`known_email_domains = $${vals.length}`);
      before.knownEmailDomains = beforeRow.known_email_domains ?? null;
      after.knownEmailDomains = domains;
    }
    vals.push(beforeRow.id);
    const updated = await query(
      `UPDATE work_provider SET ${sets.join(", ")}, updated_at = now() WHERE id = $${vals.length}
       RETURNING *`,
      vals
    );
    if (!updated[0]) return { status: 404, jsonBody: { error: "not found" } };
    const actor = actorFromClaims(claims);
    await writeAudit({
      action: AUDIT_ACTION.corpus_record_changed,
      summary: `Provider ${beforeRow.principal_code ?? beforeRow.id} updated: ${Object.keys(after).join(", ")}`,
      before,
      after: { ...after, principalCode: beforeRow.principal_code ?? null },
      ...actor ? { actor } : {}
    });
    return { status: 200, jsonBody: rowToProvider(updated[0]) };
  })
});

// api/src/functions/inspection.ts
var import_functions3 = require("@azure/functions");
var CONFIRMED_PHYSICAL = inspectionDecisionCodec.toInt("confirmed_physical");
var IMAGE_BASED = inspectionDecisionCodec.toInt("image_based");
import_functions3.app.http("inspectionAddressSuggestions", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "cases/{id}/inspection-suggestions",
  handler: withRole("CollisionSpike.User", async (req) => {
    try {
      const id = req.params.id;
      const caseRows = await query("SELECT case_po FROM case_ WHERE id = $1", [id]);
      const providerCode = ((caseRows[0]?.case_po ?? "").trim().match(/^[A-Za-z]+/)?.[0] ?? "").toUpperCase();
      const rows = await query(
        "SELECT * FROM inspection_address WHERE source_label LIKE 'suggested%'"
      );
      const all = rows.filter(isSuggestedAddressRow).map(rowToSuggestedAddress);
      if (!providerCode) return { status: 200, jsonBody: sortSuggestions(all) };
      const scoped = all.filter(
        (s) => !s.providerCode || s.providerCode.toUpperCase() === providerCode
      );
      return { status: 200, jsonBody: sortSuggestions(scoped.length > 0 ? scoped : all) };
    } catch {
      return { status: 200, jsonBody: [] };
    }
  })
});
import_functions3.app.http("inspectionAddressCounts", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "inspection-addresses/counts",
  handler: withRole("CollisionSpike.User", async () => {
    try {
      const rows = await query(
        "SELECT source_label, decision_mode_code FROM inspection_address"
      );
      let confirmed = 0;
      let suggested = 0;
      for (const r of rows) {
        if (isSuggestedAddressRow(r)) suggested += 1;
        else if (r.decision_mode_code === CONFIRMED_PHYSICAL) confirmed += 1;
      }
      const counts = { confirmed, suggested };
      return { status: 200, jsonBody: counts };
    } catch {
      return { status: 200, jsonBody: { confirmed: 0, suggested: 0 } };
    }
  })
});
import_functions3.app.http("saveInspectionDecision", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "cases/{id}/inspection-decision",
  handler: withRole("CollisionSpike.User", async (req, _ctx, claims) => {
    const caseId = req.params.id;
    const decision = await req.json();
    try {
      const lines = (decision.addressLines ?? []).map((l) => (l ?? "").trim()).filter(Boolean);
      const isImageBased = decision.decisionMode === "image_based";
      const label = (isImageBased ? "Image Based Assessment" : [lines[0], decision.postcode?.trim()].filter(Boolean).join(", ") || "Inspection address").slice(0, 200);
      let providerCode = "";
      try {
        const caseRows = await query("SELECT case_po FROM case_ WHERE id = $1", [caseId]);
        providerCode = ((caseRows[0]?.case_po ?? "").trim().match(/^[A-Za-z]+/)?.[0] ?? "").toUpperCase();
      } catch {
      }
      const sourceNote = [
        `case=${caseId}`,
        ...providerCode ? [`provider=${providerCode}`] : [],
        decision.sourceNote
      ].join(" ").trim();
      const decisionModeCode = decision.decisionMode && decision.decisionMode !== "unknown" ? inspectionDecisionCodec.toInt(decision.decisionMode) : void 0;
      const decisionReason = decisionModeCode === IMAGE_BASED ? decision.sourceNote.trim() || "Image based assessment" : null;
      const rows = await query(
        `INSERT INTO inspection_address
           (label, decision_mode_code, decision_reason, source_label, source_note,
            address_line1, address_line2, address_line3, address_line4, address_line5, address_line6, postcode)
         VALUES ($1, COALESCE($2, 100000003), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (label) DO UPDATE SET
           decision_mode_code = EXCLUDED.decision_mode_code,
           decision_reason    = EXCLUDED.decision_reason,
           source_label       = EXCLUDED.source_label,
           source_note        = EXCLUDED.source_note,
           address_line1      = EXCLUDED.address_line1,
           address_line2      = EXCLUDED.address_line2,
           address_line3      = EXCLUDED.address_line3,
           address_line4      = EXCLUDED.address_line4,
           address_line5      = EXCLUDED.address_line5,
           address_line6      = EXCLUDED.address_line6,
           postcode           = EXCLUDED.postcode
         RETURNING id`,
        [
          label,
          decisionModeCode ?? null,
          decisionReason,
          decision.sourceLabel,
          sourceNote,
          lines[0] ?? null,
          lines[1] ?? null,
          lines[2] ?? null,
          lines[3] ?? null,
          lines[4] ?? null,
          lines[5] ?? null,
          isImageBased ? null : decision.postcode?.trim() ?? null
        ]
      );
      const id = rows[0]?.id;
      await writeAudit({
        action: AUDIT_ACTION.inspection_override,
        caseId,
        summary: `Inspection decision confirmed (${decision.decisionMode})`,
        after: { decisionMode: decision.decisionMode, label },
        ...actorFromClaims(claims) ? { actor: actorFromClaims(claims) } : {}
      });
      const result = { persisted: true, ...id ? { id } : {} };
      return { status: 200, jsonBody: result };
    } catch {
      return { status: 200, jsonBody: { persisted: false } };
    }
  })
});

// api/src/functions/dashboard.ts
var import_functions4 = require("@azure/functions");
function nowParam2(req) {
  const raw = req.query.get("now");
  if (!raw) return /* @__PURE__ */ new Date();
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? /* @__PURE__ */ new Date() : d;
}
async function loadAllCases2(now) {
  const rows = await query(`${CASE_SELECT} ORDER BY c.created_at DESC`);
  return rows.map((r) => rowToCase(r, { now }));
}
function computeLiveCounts(all) {
  return {
    notReady: filterQueue(all, "not-ready").length,
    review: filterQueue(all, "review").length,
    held: filterQueue(all, "held").length
  };
}
function computeThroughput(all, now) {
  const today = startOfDay(now);
  const weekStart = startOfWeek(now);
  let inToday = 0;
  let submittedToday = 0;
  let clearedThisWeek = 0;
  let submittedTotal = 0;
  for (const c of all) {
    if (isSameDay(parseDmy(c.createdAt), today)) inToday += 1;
    if (statusToStage(c.status) === "submitted") submittedTotal += 1;
    const sub = parseDmy(c.submittedAt);
    if (sub) {
      if (isSameDay(sub, today)) submittedToday += 1;
      if (startOfDay(sub).getTime() >= weekStart.getTime()) clearedThisWeek += 1;
    }
  }
  return { inToday, submittedToday, clearedThisWeek, submittedTotal };
}
function computeAgingExceptions(all, now) {
  const today = startOfDay(now);
  const rows = actionableCases(all).map((c) => {
    const due = parseDmy(c.dateDue);
    const daysToDue = due ? daysBetween(today, due) : Number.POSITIVE_INFINITY;
    return {
      case: c,
      daysToDue,
      pastDue: due ? daysToDue < 0 : false,
      ...c.actionReason ? { reason: c.actionReason } : {}
    };
  }).sort((a, b) => a.daysToDue - b.daysToDue);
  return {
    rows,
    pastDueCount: rows.filter((r) => r.pastDue).length,
    duplicateCount: rows.filter((r) => r.reason === "duplicate").length,
    conflictCount: rows.filter((r) => r.reason === "conflict").length
  };
}
function computeQueueCounts(all) {
  return {
    "not-ready": filterQueue(all, "not-ready").length,
    review: filterQueue(all, "review").length,
    held: filterQueue(all, "held").length
  };
}
function computeReasonFacets(all) {
  const tally = /* @__PURE__ */ new Map();
  for (const c of actionableCases(all)) {
    if (!c.actionReason) continue;
    tally.set(c.actionReason, (tally.get(c.actionReason) ?? 0) + 1);
  }
  return Object.keys(REASON_LABELS).map((reason) => ({ reason, label: REASON_LABELS[reason], count: tally.get(reason) ?? 0 })).filter((f) => f.count > 0);
}
function computePipelineStages(all) {
  const defs = [
    { key: "new", label: "New" },
    { key: "not_ready", label: "Not ready" },
    { key: "review", label: "Review" },
    { key: "submitted", label: "Submitted" }
  ];
  const counts = new Map(defs.map((d) => [d.key, 0]));
  for (const c of all) {
    if (c.onHold) continue;
    const k = statusToStage(c.status);
    if (k === void 0) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return defs.map((d) => ({
    key: d.key,
    label: d.label,
    count: counts.get(d.key) ?? 0,
    tone: d.key === "not_ready" ? "stuck" : "normal"
  }));
}
import_functions4.app.http("liveCounts", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "dashboard/live-counts",
  handler: withRole("CollisionSpike.User", async (req) => {
    const all = await loadAllCases2(nowParam2(req));
    return { status: 200, jsonBody: computeLiveCounts(all) };
  })
});
import_functions4.app.http("throughput", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "dashboard/throughput",
  handler: withRole("CollisionSpike.User", async (req) => {
    const now = nowParam2(req);
    const all = await loadAllCases2(now);
    return { status: 200, jsonBody: computeThroughput(all, now) };
  })
});
import_functions4.app.http("agingExceptions", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "dashboard/aging-exceptions",
  handler: withRole("CollisionSpike.User", async (req) => {
    const now = nowParam2(req);
    const all = await loadAllCases2(now);
    return { status: 200, jsonBody: computeAgingExceptions(all, now) };
  })
});
import_functions4.app.http("queueCounts", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "dashboard/queue-counts",
  handler: withRole("CollisionSpike.User", async (req) => {
    const all = await loadAllCases2(nowParam2(req));
    return { status: 200, jsonBody: computeQueueCounts(all) };
  })
});
import_functions4.app.http("reasonCounts", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "dashboard/reason-counts",
  handler: withRole("CollisionSpike.User", async (req) => {
    const all = await loadAllCases2(nowParam2(req));
    return { status: 200, jsonBody: computeReasonFacets(all) };
  })
});
import_functions4.app.http("pipelineStages", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "dashboard/pipeline-stages",
  handler: withRole("CollisionSpike.User", async (req) => {
    const all = await loadAllCases2(nowParam2(req));
    return { status: 200, jsonBody: computePipelineStages(all) };
  })
});
import_functions4.app.http("dashboardSummary", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "dashboard",
  handler: withRole("CollisionSpike.User", async (req) => {
    const now = nowParam2(req);
    const all = await loadAllCases2(now);
    let inbound = { ...INBOUND_COUNTS_ZERO };
    try {
      const inboundRows = await query("SELECT category_code, triage_state FROM inbound_email");
      inbound = tallyActiveInboundCounts(inboundRows);
    } catch {
    }
    const summary = {
      liveCounts: computeLiveCounts(all),
      throughput: computeThroughput(all, now),
      queueCounts: computeQueueCounts(all),
      pipelineStages: computePipelineStages(all),
      reasonFacets: computeReasonFacets(all),
      agingExceptions: computeAgingExceptions(all, now),
      inbound
    };
    return { status: 200, jsonBody: summary };
  })
});

// api/src/functions/gates.ts
var import_functions5 = require("@azure/functions");
import_functions5.app.http("getBoxGates", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "gates/box",
  handler: withRole("CollisionSpike.User", async () => {
    try {
      const result = {
        apiEnabled: gates.boxApi(),
        folderAtIntakeEnabled: gates.boxFolderAtIntake(),
        fileRequestEnabled: gates.boxFileRequest(),
        embedEnabled: gates.boxEmbed(),
        metadataEnabled: gates.boxMetadata(),
        fileRequestTemplateConfigured: gates.boxFileRequestTemplateId() !== ""
      };
      return { status: 200, jsonBody: result };
    } catch {
      return { status: 200, jsonBody: { ...BOX_GATES_ALL_FALSE } };
    }
  })
});
import_functions5.app.http("getBoxFileRequestTemplateId", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "gates/box/file-request-template",
  handler: withRole("CollisionSpike.User", async () => {
    try {
      const id = gates.boxFileRequestTemplateId();
      return { status: 200, jsonBody: { templateId: id !== "" ? id : null } };
    } catch {
      return { status: 200, jsonBody: { templateId: null } };
    }
  })
});
import_functions5.app.http("getLocationAssistGate", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "gates/location-assist",
  handler: withRole("CollisionSpike.User", async () => {
    try {
      const result = {
        assistEnabled: gates.locationAssist(),
        mapsEnabled: gates.azureMaps(),
        apiBaseConfigured: gates.locationAssistApiBase() !== "",
        enabled: gates.locationAssistEnabled()
      };
      return { status: 200, jsonBody: result };
    } catch {
      return { status: 200, jsonBody: { ...LOCATION_ASSIST_GATE_ALL_OFF } };
    }
  })
});
import_functions5.app.http("getAiAssistGate", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "gates/ai-assist",
  handler: withRole("CollisionSpike.User", async () => {
    try {
      const result = {
        enabled: gates.aiAssist(),
        modelConfigured: gates.aiAssistConfigured()
      };
      return { status: 200, jsonBody: result };
    } catch {
      return { status: 200, jsonBody: { ...AI_ASSIST_GATE_ALL_OFF } };
    }
  })
});

// api/src/functions/settings.ts
var import_functions6 = require("@azure/functions");
var HOLD_KEY = "hold_new_cases_by_default";
import_functions6.app.http("getHoldNewCasesDefault", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "settings/hold-new-cases",
  handler: withRole("CollisionSpike.User", async () => {
    try {
      const rows = await query("SELECT value FROM app_setting WHERE key = $1", [HOLD_KEY]);
      return { status: 200, jsonBody: { value: (rows[0]?.value ?? "false") === "true" } };
    } catch {
      return { status: 200, jsonBody: { value: false } };
    }
  })
});
import_functions6.app.http("setHoldNewCasesDefault", {
  methods: ["PUT"],
  authLevel: "anonymous",
  route: "settings/hold-new-cases",
  handler: withRole("CollisionSpike.Superuser", async (req, _ctx, claims) => {
    const body = await req.json();
    const actor = actorFromClaims(claims);
    const valueStr = body.value ? "true" : "false";
    try {
      await query(
        `INSERT INTO app_setting (key, value, updated_at, updated_by)
         VALUES ($1, $2, now(), $3)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
        [HOLD_KEY, valueStr, actor ?? null]
      );
    } catch {
      return { status: 503, jsonBody: { error: "settings store unavailable" } };
    }
    await writeAudit({
      action: AUDIT_ACTION.corpus_record_changed,
      summary: `Set hold-new-cases-by-default = ${valueStr}`,
      after: { key: HOLD_KEY, value: valueStr },
      ...actor ? { actor } : {}
    });
    return { status: 204 };
  })
});

// api/src/functions/inbound.ts
var import_functions7 = require("@azure/functions");
var TRIAGE_AUDIT_ACTION = {
  dismissed: AUDIT_ACTION.inbound_dismissed,
  actioned: AUDIT_ACTION.inbound_actioned,
  new: AUDIT_ACTION.inbound_reopened,
  routed: AUDIT_ACTION.inbound_routed
};
import_functions7.app.http("inboundEmails", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "inbound",
  handler: withRole("CollisionSpike.User", async (req) => {
    try {
      const category = req.query.get("category");
      const subtype = req.query.get("subtype");
      const view = req.query.get("view");
      const clauses = [];
      const params = [];
      if (category && category in INBOUND_CATEGORY_TO_INT) {
        params.push(INBOUND_CATEGORY_TO_INT[category]);
        clauses.push(`category_code = $${params.length}`);
      }
      const viewClause = inboundViewWhere(view);
      if (viewClause) clauses.push(viewClause);
      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
      const rows = await query(
        `SELECT * FROM inbound_email ${where} ORDER BY received_on DESC`,
        params
      );
      let result = rows.map(rowToInboundEmail);
      if (subtype) result = result.filter((r) => r.subtype === subtype);
      return { status: 200, jsonBody: result };
    } catch {
      return { status: 200, jsonBody: [] };
    }
  })
});
import_functions7.app.http("inboundEmailCounts", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "inbound/counts",
  handler: withRole("CollisionSpike.User", async () => {
    try {
      const rows = await query("SELECT category_code, triage_state FROM inbound_email");
      const counts = tallyActiveInboundCounts(rows);
      return { status: 200, jsonBody: counts };
    } catch {
      return { status: 200, jsonBody: { ...INBOUND_COUNTS_ZERO } };
    }
  })
});
import_functions7.app.http("setTriageState", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "inbound/{id}/triage",
  handler: withRole("CollisionSpike.User", async (req, _ctx, claims) => {
    const id = req.params.id;
    const body = await req.json().catch(() => ({}));
    const state = body.state;
    if (!isValidTriageState(state)) {
      return { status: 400, jsonBody: { error: "invalid triage state" } };
    }
    const existing = await query(
      "SELECT id, triage_state, case_id, source_message_id FROM inbound_email WHERE id = $1",
      [id]
    );
    if (!existing[0]) return { status: 404, jsonBody: { error: "not found" } };
    const before = existing[0].triage_state ?? "new";
    const updated = await query(
      "UPDATE inbound_email SET triage_state = $2, updated_at = now() WHERE id = $1 RETURNING id",
      [id, state]
    );
    if (!updated[0]) return { status: 404, jsonBody: { error: "not found" } };
    const actor = actorFromClaims(claims);
    await writeAudit({
      action: TRIAGE_AUDIT_ACTION[state],
      ...existing[0].case_id ? { caseId: existing[0].case_id } : {},
      summary: `Inbound email ${before} -> ${state}`,
      before: { triageState: before },
      after: {
        triageState: state,
        inboundEmailId: id,
        sourceMessageId: existing[0].source_message_id ?? null
      },
      ...actor ? { actor } : {}
    });
    return { status: 204 };
  })
});
import_functions7.app.http("reclassifyInbound", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "inbound/{id}/classification",
  handler: withRole("CollisionSpike.User", async (req, _ctx, claims) => {
    const id = req.params.id;
    const body = await req.json().catch(() => ({}));
    let category;
    let subtype;
    if (typeof body.tag === "string") {
      const mapped = richTagToClassification(body.tag);
      if (!mapped) return { status: 400, jsonBody: { error: "unknown tag" } };
      category = mapped.category;
      subtype = mapped.subtype;
    } else {
      if (typeof body.category === "string") {
        if (!(body.category in INBOUND_CATEGORY_TO_INT)) {
          return { status: 400, jsonBody: { error: "invalid category" } };
        }
        category = body.category;
      }
      if (typeof body.subtype === "string") {
        if (!(body.subtype in INBOUND_SUBTYPE_TO_INT)) {
          return { status: 400, jsonBody: { error: "invalid subtype" } };
        }
        subtype = body.subtype;
      }
    }
    if (!category && !subtype) {
      return { status: 400, jsonBody: { error: "category, subtype or tag required" } };
    }
    const existing = await query(
      `SELECT id, category_code, subtype_code, suggested_category_code, suggested_subtype_code,
              case_id, work_provider_id, source_message_id
         FROM inbound_email WHERE id = $1`,
      [id]
    );
    if (!existing[0]) return { status: 404, jsonBody: { error: "not found" } };
    const cur = existing[0];
    const sets = ["classifier_mode = 'human'"];
    const vals = [];
    if (category) {
      vals.push(INBOUND_CATEGORY_TO_INT[category]);
      sets.push(`category_code = $${vals.length}`);
    }
    if (subtype) {
      vals.push(INBOUND_SUBTYPE_TO_INT[subtype]);
      sets.push(`subtype_code = $${vals.length}`);
    }
    vals.push(id);
    const updated = await query(
      `UPDATE inbound_email SET ${sets.join(", ")}, updated_at = now() WHERE id = $${vals.length}
       RETURNING *`,
      vals
    );
    if (!updated[0]) return { status: 404, jsonBody: { error: "not found" } };
    const actor = actorFromClaims(claims);
    const suggestedCat = inboundCategoryFromInt(
      cur.suggested_category_code ?? cur.category_code
    );
    const suggestedSub = inboundSubtypeFromInt(
      cur.suggested_subtype_code ?? cur.subtype_code
    );
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (category && category !== suggestedCat) {
      await writeImprovementSignal(cur, "category", suggestedCat ?? "(none)", category, actor, reason);
    }
    if (subtype && subtype !== suggestedSub) {
      await writeImprovementSignal(cur, "subtype", suggestedSub ?? "(none)", subtype, actor, reason);
    }
    await writeAudit({
      action: AUDIT_ACTION.inbound_reclassified,
      ...cur.case_id ? { caseId: cur.case_id } : {},
      summary: `Inbound reclassified${category ? ` category=${category}` : ""}${subtype ? ` subtype=${subtype}` : ""}`,
      before: { category: suggestedCat ?? null, subtype: suggestedSub ?? null },
      after: {
        category: category ?? null,
        subtype: subtype ?? null,
        inboundEmailId: id,
        sourceMessageId: cur.source_message_id ?? null,
        ...reason ? { reason } : {}
      },
      ...actor ? { actor } : {}
    });
    return { status: 200, jsonBody: rowToInboundEmail(updated[0]) };
  })
});
async function writeImprovementSignal(row, fieldName, originalValue, correctedValue, actor, reason) {
  try {
    await query(
      `INSERT INTO improvement_signal
         (name, case_id, work_provider_id, field_name, original_value, corrected_value,
          original_provenance, actor, occurred_at, affects_eva_readiness, classification_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), false, 100000000)`,
      [
        `Inbound ${fieldName} override: ${originalValue || "(none)"} -> ${correctedValue}`,
        row.case_id ?? null,
        row.work_provider_id ?? null,
        `inbound.${fieldName}`,
        originalValue || null,
        correctedValue,
        reason || "classifier suggestion",
        actor ?? null
      ]
    );
  } catch {
  }
}

// api/src/functions/proxy.ts
var import_functions8 = require("@azure/functions");
import_functions8.app.http("locationAssistSuggest", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "location-assist/suggest",
  handler: withRole("CollisionSpike.User", async (req) => {
    if (!gates.locationAssistEnabled()) {
      return { status: 200, jsonBody: [] };
    }
    try {
      const body = await req.json();
      const result = await callLocationSuggest(body);
      return { status: 200, jsonBody: result };
    } catch {
      return { status: 200, jsonBody: [] };
    }
  })
});
import_functions8.app.http("parserParse", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "parser/parse",
  handler: withRole("CollisionSpike.User", async (req) => {
    if (!gates.pdfMapper()) {
      return { status: 200, jsonBody: { skipped: true } };
    }
    try {
      const body = await req.json();
      const result = await callParser(body);
      return { status: 200, jsonBody: result };
    } catch {
      return { status: 200, jsonBody: { skipped: true, error: true } };
    }
  })
});

// api/src/functions/internal.ts
var import_functions9 = require("@azure/functions");

// api/src/lib/enrichment-map.ts
function combineMakeModel(make, model) {
  const mk = (make ?? "").trim();
  const md = (model ?? "").trim();
  if (mk && md) {
    return md.toUpperCase().startsWith(mk.toUpperCase()) ? md : `${mk} ${md}`;
  }
  return md || mk || "";
}

// api/src/functions/internal.ts
async function withServiceAuth(req, ctx, fn) {
  try {
    await authenticate(req);
  } catch (e) {
    return toErrorResponse(e, ctx);
  }
  try {
    return await fn(req, ctx);
  } catch (e) {
    ctx.error(e);
    return { status: 500, jsonBody: { error: "internal" } };
  }
}
var TERMINAL_INT_CODES = TERMINAL_STATUSES.map((s) => caseStatusCodec.toInt(s)).filter((v) => v != null);
var AUDIT_ACTION_BY_NAME = Object.fromEntries(
  Object.entries(AUDIT_ACTION).map(([name, code]) => [name, code])
);
function senderDomain(address) {
  const at = address.lastIndexOf("@");
  if (at < 0 || at === address.length - 1) return "";
  return address.slice(at + 1).toLowerCase().trim();
}
async function recomputeStatus2(caseId) {
  const rows = await query(`${CASE_SELECT} WHERE c.id = $1`, [caseId]);
  const rec = rows[0];
  if (!rec) return "error";
  const evidenceRows = await query("SELECT * FROM evidence WHERE case_id = $1", [caseId]);
  const evidence = evidenceRows.map(rowToEvidence);
  const full = rowToCase(rec, { evidence });
  const input = {
    status: full.status,
    evaFields: full.evaFields,
    evidence: full.evidence,
    instructionCount: full.evidence.filter((e) => e.kind === "instruction").length,
    hasIdentity: full.vrm.trim().length > 0 || full.providerCode.trim().length > 0 || full.evaFields.claimantName.value.trim().length > 0
  };
  const next = statusForReviewCase(input);
  if (next !== full.status) {
    await query("UPDATE case_ SET status_code = $2, updated_at = now() WHERE id = $1", [
      caseId,
      statusToInt(next)
    ]);
    await writeAudit({
      action: AUDIT_ACTION.status_changed,
      caseId,
      summary: `Status ${full.status} -> ${next} (internal recompute)`,
      before: { status: full.status },
      after: { status: next }
    });
  }
  return next;
}
async function applyParserFields(caseId, parserRef, parserMileage, parserMileageUnit) {
  const ref = (parserRef ?? "").trim();
  const mileage = parserMileage != null ? String(parserMileage).replace(/[^\d]/g, "") : "";
  const unitRaw = (parserMileageUnit ?? "").trim();
  const unit = unitRaw === "Miles" || unitRaw === "Km" ? unitRaw : "";
  if (!ref && !mileage) return;
  const cur = await query("SELECT case_ref, eva_mileage FROM case_ WHERE id = $1", [caseId]);
  if (!cur[0]) return;
  const isEmpty = (v) => !String(v ?? "").trim();
  const sets = [];
  const vals = [];
  let mileageFilled = false;
  if (ref && isEmpty(cur[0].case_ref)) {
    sets.push(`case_ref = $${sets.length + 1}`);
    vals.push(ref.slice(0, 200));
  }
  if (mileage && isEmpty(cur[0].eva_mileage)) {
    sets.push(`eva_mileage = $${sets.length + 1}`);
    vals.push(mileage.slice(0, 20));
    mileageFilled = true;
    if (unit) {
      sets.push(`eva_mileage_unit = $${sets.length + 1}`);
      vals.push(unit);
    }
  }
  if (sets.length === 0) return;
  vals.push(caseId);
  await query(
    `UPDATE case_ SET ${sets.join(", ")}, updated_at = now() WHERE id = $${vals.length}`,
    vals
  );
  if (mileageFilled) {
    await query(
      `INSERT INTO field_level_provenance
         (name, case_id, field_name, value, source_type_code, source_label)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        `${caseId}:mileage`,
        caseId,
        "mileage",
        mileage.slice(0, 20),
        sourceTypeCodec.toInt("pdf_extraction") ?? 1e8,
        "From instructions"
      ]
    ).catch(() => {
    });
  }
}
import_functions9.app.http("internalProviderMatchRecords", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "internal/provider-match-records",
  handler: (req, ctx) => withServiceAuth(req, ctx, async () => {
    const rows = await query(
      "SELECT id, principal_code, known_email_domains, known_email_addresses, active, provider_automation_mode_code FROM work_provider ORDER BY display_name"
    );
    const records = rows.map((r) => ({
      workProviderId: r.id,
      principalCode: r.principal_code,
      knownEmailDomains: parseDomains2(r.known_email_domains),
      knownEmailAddresses: parseDomains2(r.known_email_addresses),
      active: Boolean(r.active),
      // Lets the orchestrator branch on the matched provider's automation mode
      // (work-todo-spike: automation-mode). Default review_auto (the live default).
      providerAutomationMode: automationModeCodec.toName(r.provider_automation_mode_code) ?? "review_auto"
    }));
    return { status: 200, jsonBody: records };
  })
});
function parseDomains2(raw) {
  if (!raw) return [];
  const s = raw.trim();
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr.map((d) => String(d).trim()).filter(Boolean);
    } catch {
    }
  }
  return s.split(/[\r\n,]+/).map((d) => d.trim()).filter(Boolean);
}
import_functions9.app.http("internalDedupContext", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "internal/dedup-context",
  handler: (req, ctx) => withServiceAuth(req, ctx, async () => {
    const workProviderId = req.query.get("workProviderId") ?? "";
    const vrm = req.query.get("vrm") ?? "";
    if (!workProviderId) {
      return {
        status: 200,
        jsonBody: { openProviderCases: [], seenMessageIds: [], seenPayloadHashes: [] }
      };
    }
    const caseRows = vrm ? await query(
      `SELECT id, case_ref, status_code, work_provider_id
               FROM case_
              WHERE work_provider_id = $1
                AND (vrm = $2 OR vrm IS NULL OR vrm = '')
                AND status_code NOT IN (${TERMINAL_INT_CODES.join(",")})
              ORDER BY created_at`,
      [workProviderId, vrm]
    ) : await query(
      `SELECT id, case_ref, status_code, work_provider_id
               FROM case_
              WHERE work_provider_id = $1
                AND status_code NOT IN (${TERMINAL_INT_CODES.join(",")})
              ORDER BY created_at`,
      [workProviderId]
    );
    const openProviderCases = caseRows.map((r) => ({
      caseId: r.id,
      caseRef: r.case_ref ?? void 0,
      status: caseStatusCodec.toName(r.status_code) ?? "error",
      workProviderId: r.work_provider_id ?? void 0
    }));
    const msgRows = await query(
      `SELECT source_message_id FROM case_
          WHERE work_provider_id = $1 AND source_message_id IS NOT NULL`,
      [workProviderId]
    );
    const seenMessageIds = msgRows.map((r) => r.source_message_id);
    const hashRows = await query(
      `SELECT payload_hash FROM case_
          WHERE work_provider_id = $1 AND payload_hash IS NOT NULL`,
      [workProviderId]
    );
    const seenPayloadHashes = hashRows.map((r) => r.payload_hash);
    return {
      status: 200,
      jsonBody: { openProviderCases, seenMessageIds, seenPayloadHashes }
    };
  })
});
import_functions9.app.http("internalCasesResolve", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "internal/cases/resolve",
  handler: (req, ctx) => withServiceAuth(req, ctx, async () => {
    const body = await req.json();
    const { inbound, providerId, decision } = body;
    const workProviderId = providerId ?? null;
    const vrm = ((body.parserVrm || inbound.candidateVrm) ?? "").trim();
    let providerAutomationMode = "manual";
    if (workProviderId) {
      const wpMode = await query(
        "SELECT provider_automation_mode_code FROM work_provider WHERE id = $1",
        [workProviderId]
      );
      providerAutomationMode = automationModeCodec.toName(wpMode[0]?.provider_automation_mode_code) ?? "review_auto";
    }
    if (decision.resolution === "attach" && decision.targetCaseId) {
      await upsertInboundEmail(inbound, workProviderId, decision.targetCaseId, void 0, body.parserVrm);
      await applyParserFields(decision.targetCaseId, body.parserRef, body.parserMileage, body.parserMileageUnit);
      await writeAudit({
        action: AUDIT_ACTION.case_attached,
        caseId: decision.targetCaseId,
        summary: `Email ${inbound.internetMessageId} attached to existing case`,
        after: { messageId: inbound.internetMessageId, resolution: "attach" }
      });
      return {
        status: 200,
        jsonBody: { outcome: "attached", caseId: decision.targetCaseId, providerAutomationMode }
      };
    }
    const rawStatus = decision.statusEffect;
    const statusCode = caseStatusCodec.toInt(rawStatus) ?? statusToInt("new_email");
    const caseRef = (inbound.candidateRef ?? "").trim();
    const subject = (inbound.subject ?? "").trim();
    const name = [vrm || null, subject || null].filter(Boolean).join(" \xB7 ") || "Email intake";
    const emailKindCode = intakeChannelKindCodec.toInt("email") ?? null;
    let created;
    try {
      created = await tx(async (q) => {
        let principalCode = "";
        if (workProviderId) {
          const wp = await q("SELECT principal_code FROM work_provider WHERE id = $1", [workProviderId]);
          principalCode = String(wp[0]?.principal_code ?? "").trim();
        }
        const newClient = !workProviderId || !principalCode;
        let casePo = null;
        if (!newClient) {
          const principal = principalCode.toUpperCase();
          const yy = casePoYear();
          const prefix = `${principal}${yy}`;
          await q("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)", [`casepo:${prefix}`]);
          const seqRows = await q(
            `SELECT COALESCE(MAX(SUBSTRING(upper(case_po) FROM length($3) + 1)::int), 0) + 1 AS next_seq
                 FROM case_
                WHERE upper(case_po) LIKE $1 AND upper(case_po) ~ $2`,
            [`${prefix}%`, casePoSequenceRegex(principal, yy), prefix]
          );
          casePo = formatCasePo(principal, yy, Number(seqRows[0]?.next_seq ?? 1));
        }
        const cols = [
          "name",
          "vrm",
          "status_code",
          "intake_channel_kind_code",
          "intake_channel_manual",
          "source_mailbox",
          "source_message_id",
          "payload_hash",
          "work_provider_id"
        ];
        const vals = [
          name,
          vrm || null,
          statusCode,
          emailKindCode,
          false,
          inbound.sourceMailbox ?? null,
          inbound.internetMessageId ?? null,
          inbound.payloadHash ?? null,
          workProviderId
        ];
        if (caseRef) {
          cols.push("case_ref");
          vals.push(caseRef);
        }
        if (casePo) {
          cols.push("case_po");
          vals.push(casePo);
        }
        if (newClient) {
          cols.push("on_hold");
          vals.push(true);
          cols.push("action_reason_code");
          vals.push(actionReasonCodec.toInt("needs_review") ?? null);
        }
        const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
        const rows = await q(
          `INSERT INTO case_ (${cols.join(", ")}) VALUES (${placeholders}) RETURNING id`,
          vals
        );
        const caseId = rows[0]?.id;
        if (!caseId) throw new Error("case insert returned no id");
        return { caseId, casePo, newClient, principalCode };
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        const constraint = uniqueConstraintName(e);
        if (constraint === "uq_case_case_po") {
          ctx.error(`[cases/resolve] case_po unique collision (${constraint})`);
          return { status: 500, jsonBody: { error: "case_po_collision" } };
        }
        return { status: 409, jsonBody: { error: "conflict", detail: "source_message_id already exists" } };
      }
      throw e;
    }
    const newCaseId = created.caseId;
    await upsertInboundEmail(inbound, workProviderId, newCaseId, void 0, body.parserVrm);
    await applyParserFields(newCaseId, body.parserRef, body.parserMileage, body.parserMileageUnit);
    const auditAction = AUDIT_ACTION[decision.auditAction] ?? AUDIT_ACTION.case_created;
    await writeAudit({
      action: auditAction,
      caseId: newCaseId,
      summary: `Case ${decision.resolution}: ${name}`,
      after: { resolution: decision.resolution, status: rawStatus, vrm, casePo: created.casePo }
    });
    if (created.newClient) {
      const domain = senderDomain(inbound.senderAddress ?? "");
      await query(
        `INSERT INTO note (name, case_id, author, text, occurred_at) VALUES ($1, $2, $3, $4, now())`,
        [
          "New client",
          newCaseId,
          "Email intake (auto)",
          `New client \u2014 no work provider matched for sender${domain ? ` @${domain}` : ""}. No Case/PO minted; set up the work provider and confirm before EVA.`
        ]
      ).catch(() => {
      });
      await writeAudit({
        action: AUDIT_ACTION.inbound_routed,
        caseId: newCaseId,
        severity: "warning",
        summary: "New client routed to Held (no work provider matched)",
        after: { newClient: true, onHold: true, senderDomain: domain }
      });
    }
    return {
      status: 200,
      jsonBody: { outcome: "created", caseId: newCaseId, casePo: created.casePo, providerAutomationMode }
    };
  })
});
import_functions9.app.http("internalInboundEmail", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "internal/inbound-email",
  handler: (req, ctx) => withServiceAuth(req, ctx, async () => {
    const body = await req.json();
    const inboundEmailId = await upsertInboundEmail(
      body.inbound,
      body.providerId ?? null,
      null,
      body.classification
    );
    return { status: 200, jsonBody: { inboundEmailId } };
  })
});
async function upsertInboundEmail(inbound, workProviderId, caseId, classification, parserVrm, triageState) {
  const subject = (inbound.subject ?? "").trim();
  const name = `Email: ${subject || inbound.internetMessageId}`;
  const categoryCode = classification ? INBOUND_CATEGORY_TO_INT[classification.category] ?? null : null;
  const subtypeCode = classification ? INBOUND_SUBTYPE_TO_INT[classification.subtype] ?? null : null;
  const bodyVrm = ((parserVrm || classification?.bodyVrm || inbound.candidateVrm) ?? "").trim() || null;
  const bodyCaseref = classification?.bodyCaseref || inbound.candidateRef || "" || null;
  const bodyPreview = (inbound.bodyPreview ?? "") || null;
  const confidence = classification ? classification.confidence : null;
  const signals = classification ? JSON.stringify(classification.signals ?? []) : null;
  try {
    const rows = await query(
      `INSERT INTO inbound_email
         (name, source_message_id, subject, from_address, sender_domain,
          source_mailbox, received_on, has_attachments, category_code, subtype_code,
          confidence, classifier_mode, signals, triage_state, body_vrm, body_caseref,
          body_preview, case_id, work_provider_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'deterministic',$12,COALESCE($18, 'new'),$13,$14,$15,$16,$17)
       ON CONFLICT (source_message_id) DO UPDATE SET
         case_id          = COALESCE(EXCLUDED.case_id, inbound_email.case_id),
         category_code    = COALESCE(EXCLUDED.category_code, inbound_email.category_code),
         subtype_code     = COALESCE(EXCLUDED.subtype_code, inbound_email.subtype_code),
         confidence       = COALESCE(EXCLUDED.confidence, inbound_email.confidence),
         signals          = COALESCE(EXCLUDED.signals, inbound_email.signals),
         body_vrm         = COALESCE(EXCLUDED.body_vrm, inbound_email.body_vrm),
         body_caseref     = COALESCE(EXCLUDED.body_caseref, inbound_email.body_caseref),
         body_preview     = COALESCE(EXCLUDED.body_preview, inbound_email.body_preview),
         work_provider_id = COALESCE(EXCLUDED.work_provider_id, inbound_email.work_provider_id),
         -- Re-ingest / link MUST NOT reset a staff-set durable handled state (work-todo-spike
         -- email-management d): once a person actioned/dismissed a row, an automated replay
         -- (classify / caseResolve / link-reply 'routed') leaves it handled.
         triage_state     = CASE
                              WHEN inbound_email.triage_state IN ('actioned','dismissed')
                                THEN inbound_email.triage_state
                              ELSE COALESCE($18, inbound_email.triage_state)
                            END,
         updated_at       = now()
       RETURNING id`,
      [
        name,
        inbound.internetMessageId ?? null,
        subject || null,
        inbound.senderAddress ?? null,
        senderDomain(inbound.senderAddress ?? ""),
        inbound.sourceMailbox ?? null,
        inbound.receivedAt ?? null,
        (inbound.attachments?.length ?? 0) > 0,
        categoryCode,
        subtypeCode,
        confidence,
        signals,
        bodyVrm,
        bodyCaseref,
        bodyPreview,
        caseId,
        workProviderId,
        triageState ?? null
      ]
    );
    const inboundEmailId = rows[0]?.id ?? null;
    if (inboundEmailId && classification && (categoryCode != null || subtypeCode != null)) {
      await query(
        `UPDATE inbound_email
            SET suggested_category_code = COALESCE(suggested_category_code, $2),
                suggested_subtype_code  = COALESCE(suggested_subtype_code, $3)
          WHERE id = $1`,
        [inboundEmailId, categoryCode, subtypeCode]
      ).catch(() => {
      });
    }
    return inboundEmailId;
  } catch {
    return null;
  }
}
function isUniqueViolation(e) {
  return e != null && typeof e === "object" && "code" in e && e.code === "23505";
}
function uniqueConstraintName(e) {
  if (e != null && typeof e === "object" && "constraint" in e) {
    const c = e.constraint;
    return typeof c === "string" ? c : void 0;
  }
  return void 0;
}
import_functions9.app.http("internalCasesEnrichment", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "internal/cases/{id}/enrichment",
  handler: (req, ctx) => withServiceAuth(req, ctx, async () => {
    const caseId = req.params.id;
    const body = await req.json();
    const cur = await query(
      "SELECT eva_vehicle_model, eva_mileage, eva_mileage_unit FROM case_ WHERE id = $1",
      [caseId]
    );
    if (!cur[0]) return { status: 404, jsonBody: { error: "case not found" } };
    const vehicleModel = combineMakeModel(
      String(body.make ?? "").trim(),
      String(body.vehicle_model ?? "").trim()
    );
    const mileage = body.current_mileage != null ? String(body.current_mileage).replace(/[^\d]/g, "") : "";
    const mileageUnitRaw = String(body.mileage_unit ?? "").trim();
    const mileageUnit = mileageUnitRaw === "Miles" || mileageUnitRaw === "Km" ? mileageUnitRaw : "";
    const applied = [];
    const sets = [];
    const vals = [];
    const isEmpty = (v) => !String(v ?? "").trim();
    if (vehicleModel && isEmpty(cur[0].eva_vehicle_model)) {
      sets.push(`eva_vehicle_model = $${sets.length + 1}`);
      vals.push(vehicleModel.slice(0, 200));
      applied.push("vehicleModel");
    }
    if (mileage && isEmpty(cur[0].eva_mileage)) {
      sets.push(`eva_mileage = $${sets.length + 1}`);
      vals.push(mileage.slice(0, 20));
      applied.push("mileage");
      if (mileageUnit) {
        sets.push(`eva_mileage_unit = $${sets.length + 1}`);
        vals.push(mileageUnit);
        applied.push("mileageUnit");
      }
    }
    if (sets.length > 0) {
      vals.push(caseId);
      await query(
        `UPDATE case_ SET ${sets.join(", ")}, updated_at = now() WHERE id = $${vals.length}`,
        vals
      );
      await recomputeStatus2(caseId);
    }
    await writeAudit({
      action: AUDIT_ACTION.enrichment_called,
      caseId,
      summary: `Enrichment persisted: ${applied.length ? applied.join(", ") : "no new fields"}`,
      after: { applied, warnings: body.warnings ?? [] }
    });
    ctx.log(JSON.stringify({ evt: "internalCasesEnrichment", caseId, applied }));
    return { status: 200, jsonBody: { applied } };
  })
});
import_functions9.app.http("internalInboundLinkReply", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "internal/inbound/link-reply",
  handler: (req, ctx) => withServiceAuth(req, ctx, async () => {
    const body = await req.json();
    const { inbound } = body;
    const workProviderId = body.providerId ?? null;
    const ref = (body.ref ?? "").trim();
    const vrm = (body.vrm ?? "").trim();
    let candidates = [];
    if (ref) {
      candidates = await query(
        `SELECT id, case_ref, case_po, vrm FROM case_
            WHERE (case_ref = $1 OR case_po = $1)
              AND status_code NOT IN (${TERMINAL_INT_CODES.join(",")})
            ORDER BY created_at`,
        [ref]
      );
    }
    if (candidates.length === 0 && vrm) {
      candidates = await query(
        `SELECT id, case_ref, case_po, vrm FROM case_
            WHERE vrm = $1
              AND status_code NOT IN (${TERMINAL_INT_CODES.join(",")})
            ORDER BY created_at`,
        [vrm]
      );
    }
    const linkCaseId = candidates.length === 1 ? candidates[0].id : null;
    await upsertInboundEmail(
      inbound,
      workProviderId,
      linkCaseId,
      void 0,
      void 0,
      linkCaseId ? "routed" : void 0
    );
    if (linkCaseId) {
      await writeAudit({
        action: AUDIT_ACTION.inbound_routed,
        caseId: linkCaseId,
        summary: `Reply linked to existing case (${ref ? `ref ${ref}` : `vrm ${vrm}`})`,
        after: { matchedBy: ref ? "caseref" : "vrm", messageId: inbound.internetMessageId }
      });
      ctx.log(JSON.stringify({ evt: "linkReply", outcome: "linked", caseId: linkCaseId }));
      return { status: 200, jsonBody: { outcome: "linked", caseId: linkCaseId, candidateCount: 1 } };
    }
    if (candidates.length > 1) {
      await writeAudit({
        action: AUDIT_ACTION.duplicate_flagged,
        severity: "warning",
        summary: `Reply matched ${candidates.length} open cases (${ref ? `ref ${ref}` : `vrm ${vrm}`}); held for manual linking`,
        after: { candidateCount: candidates.length, candidateIds: candidates.map((c) => c.id) }
      });
      ctx.log(JSON.stringify({ evt: "linkReply", outcome: "ambiguous", count: candidates.length }));
      return { status: 200, jsonBody: { outcome: "ambiguous", candidateCount: candidates.length } };
    }
    ctx.log(JSON.stringify({ evt: "linkReply", outcome: "no_match" }));
    return { status: 200, jsonBody: { outcome: "no_match", candidateCount: 0 } };
  })
});
async function applyEvidenceMetadata(ctx, whereClause, whereVals, row, computed) {
  const sets = [];
  const vals = [...whereVals];
  const push = (col, v) => {
    vals.push(v);
    sets.push(`${col} = $${vals.length}`);
  };
  if (row.imageRoleCode != null || row.imageRole != null) push("image_role_code", computed.imageRoleCode);
  if (typeof row.registrationVisible === "boolean") push("registration_visible", computed.registrationVisible);
  if (row.excluded != null) {
    push("excluded", computed.excluded);
    push("exclusion_reason", computed.exclusionReason);
  } else if (typeof row.exclusionReason === "string" && row.exclusionReason.trim()) {
    push("exclusion_reason", row.exclusionReason.trim());
  }
  if (row.sha256 != null) push("sha256", computed.sha256);
  if (row.sequenceIndex != null) push("sequence_index", computed.sequenceIndex);
  if (sets.length === 0) return 0;
  try {
    const res = await query(
      `UPDATE evidence SET ${sets.join(", ")}, updated_at = now() WHERE ${whereClause} RETURNING id`,
      vals
    );
    return res.length;
  } catch (e) {
    ctx.error(e);
    return 0;
  }
}
import_functions9.app.http("internalCasesEvidence", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "internal/cases/{id}/evidence",
  handler: (req, ctx) => withServiceAuth(req, ctx, async () => {
    const caseId = req.params.id;
    const body = await req.json();
    let persisted = 0;
    let updated = 0;
    for (const row of body.rows ?? []) {
      const kindCode = evidenceKindCodec.toInt(
        row.evidenceClass ?? "other"
      ) ?? null;
      const imageRoleCode = (typeof row.imageRoleCode === "number" ? row.imageRoleCode : void 0) ?? imageRoleCodec.toInt(row.imageRole) ?? 100000003;
      const registrationVisible = typeof row.registrationVisible === "boolean" ? row.registrationVisible : null;
      const excluded = row.excluded === true;
      const exclusionReason = excluded ? (row.exclusionReason ?? "").trim() || "Excluded" : (row.exclusionReason ?? "").trim() || null;
      const sha256 = (row.sha256 ?? "").trim() || null;
      const sequenceIndex = Number.isInteger(row.sequenceIndex) ? row.sequenceIndex : null;
      const hasMetadata = row.imageRoleCode != null || row.imageRole != null || typeof row.registrationVisible === "boolean" || row.excluded != null || row.exclusionReason != null || row.sha256 != null || row.sequenceIndex != null;
      const sourceMessageId = (row.sourceMessageId ?? "").trim() || null;
      const boxFileId = (row.boxFileId ?? "").trim() || null;
      const isBoxRow = sourceMessageId != null || boxFileId != null;
      let inserted = false;
      if (isBoxRow) {
        const dedupCol = sourceMessageId != null ? "source_message_id" : "box_file_id";
        const dedupVal = sourceMessageId ?? boxFileId;
        const result = await query(
          `INSERT INTO evidence
               (file_name, case_id, kind_code, content_type, size_bytes,
                source_message_id, box_file_id, box_file_url, accepted_for_eva, source_label,
                image_role_code, registration_visible, excluded, exclusion_reason, sha256, sequence_index)
             SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
             WHERE NOT EXISTS (
               SELECT 1 FROM evidence WHERE case_id = $2 AND ${dedupCol} = $17
             )
             RETURNING id`,
          [
            row.filename,
            caseId,
            kindCode,
            row.contentType || null,
            row.size ?? null,
            sourceMessageId,
            boxFileId,
            (row.boxFileUrl ?? "").trim() || null,
            row.acceptedForEva ?? true,
            (row.sourceLabel ?? "").trim() || "box_upload",
            imageRoleCode,
            registrationVisible,
            excluded,
            exclusionReason,
            sha256,
            sequenceIndex,
            dedupVal
          ]
        );
        inserted = result.length > 0;
        if (!inserted && hasMetadata) {
          updated += await applyEvidenceMetadata(
            ctx,
            `case_id = $1 AND ${dedupCol} = $2`,
            [caseId, dedupVal],
            row,
            { imageRoleCode, registrationVisible, excluded, exclusionReason, sha256, sequenceIndex }
          );
        }
      } else {
        const result = await query(
          `INSERT INTO evidence
               (file_name, case_id, kind_code, content_type, size_bytes, storage_path, source_label,
                image_role_code, registration_visible, excluded, exclusion_reason, sha256, sequence_index)
             SELECT $1, $2, $3, $4, $5, $6::text, 'auto-intake', $7, $8, $9, $10, $11, $12
             WHERE NOT EXISTS (
               SELECT 1 FROM evidence WHERE case_id = $2 AND storage_path = $6::text
             )
             RETURNING id`,
          [
            row.filename,
            caseId,
            kindCode,
            row.contentType || null,
            row.size ?? null,
            row.blobPath ?? null,
            imageRoleCode,
            registrationVisible,
            excluded,
            exclusionReason,
            sha256,
            sequenceIndex
          ]
        );
        inserted = result.length > 0;
        if (!inserted && hasMetadata && row.blobPath) {
          updated += await applyEvidenceMetadata(
            ctx,
            "case_id = $1 AND storage_path = $2::text",
            [caseId, row.blobPath],
            row,
            { imageRoleCode, registrationVisible, excluded, exclusionReason, sha256, sequenceIndex }
          );
        }
      }
      if (inserted) persisted++;
    }
    return { status: 200, jsonBody: { persisted, updated } };
  })
});
import_functions9.app.http("internalCasesStatusEvaluate", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "internal/cases/{id}/status-evaluate",
  handler: (req, ctx) => withServiceAuth(req, ctx, async () => {
    const caseId = req.params.id;
    const value = await recomputeStatus2(caseId);
    return { status: 200, jsonBody: { value } };
  })
});
import_functions9.app.http("internalAudit", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "internal/audit",
  handler: (req, ctx) => withServiceAuth(req, ctx, async () => {
    const body = await req.json();
    const code = AUDIT_ACTION_BY_NAME[body.action];
    await writeAudit({
      action: code ?? AUDIT_ACTION.graph_message_ingested,
      caseId: body.caseId,
      summary: body.summary,
      severity: body.severity ?? "info",
      before: body.before,
      after: body.after
    });
    return { status: 204 };
  })
});
import_functions9.app.http("internalPrincipals", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "internal/principals",
  handler: (req, ctx) => withServiceAuth(req, ctx, async () => {
    const rows = await query(
      "SELECT principal_code FROM work_provider WHERE active = true ORDER BY principal_code"
    );
    return {
      status: 200,
      jsonBody: rows.map((r) => ({ principalCode: r.principal_code }))
    };
  })
});
import_functions9.app.http("internalDispositionDue", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "internal/disposition/due",
  handler: (req, ctx) => withServiceAuth(req, ctx, async () => {
    const rows = await query(
      `SELECT id FROM case_
          WHERE retention_expires_at IS NOT NULL
            AND retention_expires_at < now()
            AND legal_hold IS NOT TRUE
          ORDER BY retention_expires_at
          LIMIT 500`
    );
    return {
      status: 200,
      jsonBody: rows.map((r) => ({ caseId: r.id }))
    };
  })
});
import_functions9.app.http("internalDispositionCase", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "internal/disposition/{id}",
  handler: (req, ctx) => withServiceAuth(req, ctx, async () => {
    const caseId = req.params.id;
    const evaCols = EVA_FIELD_ORDER.map((d) => `${EVA_COLUMN_BY_KEY[d.key]} = ''`).join(", ");
    await query(
      `UPDATE case_
            SET ${evaCols},
                vrm = '', case_ref = '', name = '[disposed]',
                ov_insured_name = NULL, ov_claimant_name = NULL,
                ov_third_party_name = NULL, ov_claim_number = NULL,
                ov_policy_reference = NULL, ov_incident_date = NULL,
                ov_insurer_name = NULL, ov_repairer_name = NULL,
                closed_at = now(), updated_at = now()
          WHERE id = $1`,
      [caseId]
    );
    await writeAudit({
      action: AUDIT_ACTION.case_disposed,
      caseId,
      summary: "Retention disposition: PII fields cleared",
      severity: "warning"
    });
    return { status: 204 };
  })
});
import_functions9.app.http("internalBoxCaseByFolder", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "internal/box/case-by-folder/{folderId}",
  handler: (req, ctx) => withServiceAuth(req, ctx, async () => {
    const folderId = (req.params.folderId ?? "").trim();
    if (!folderId) return { status: 200, jsonBody: { caseId: null } };
    const rows = await query(
      "SELECT id FROM case_ WHERE box_folder_id = $1 LIMIT 1",
      [folderId]
    );
    const caseId = rows.length > 0 ? rows[0].id : null;
    return { status: 200, jsonBody: { caseId } };
  })
});
import_functions9.app.http("internalBoxPurgeCandidates", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "internal/box/purge-candidates",
  handler: (req, ctx) => withServiceAuth(req, ctx, async () => {
    const rows = await query(
      `SELECT case_id, storage_path
           FROM evidence
          WHERE box_file_id IS NOT NULL
            AND storage_path IS NOT NULL
          ORDER BY created_at
          LIMIT 1000`
    );
    return {
      status: 200,
      jsonBody: rows.map((r) => ({
        caseId: r.case_id,
        blobPath: r.storage_path
      }))
    };
  })
});
import_functions9.app.http("internalBoxMarkPurged", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "internal/box/mark-purged",
  handler: (req, ctx) => withServiceAuth(req, ctx, async () => {
    const body = await req.json();
    await query(
      `UPDATE evidence
            SET storage_path = NULL, updated_at = now()
          WHERE case_id = $1 AND storage_path = $2`,
      [body.caseId, body.blobPath]
    );
    return { status: 204 };
  })
});
import_functions9.app.http("internalCaseBoxFolderGet", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "internal/cases/{id}/box-folder",
  handler: (req, ctx) => withServiceAuth(req, ctx, async () => {
    const caseId = (req.params.id ?? "").trim();
    if (!caseId) return { status: 200, jsonBody: { boxFolderId: null, boxFolderUrl: null, casePo: null } };
    const rows = await query(
      "SELECT box_folder_id, box_folder_url, case_po FROM case_ WHERE id = $1",
      [caseId]
    );
    const r = rows[0];
    return {
      status: 200,
      jsonBody: {
        boxFolderId: r?.box_folder_id ?? null,
        boxFolderUrl: r?.box_folder_url ?? null,
        casePo: r?.case_po ?? null
      }
    };
  })
});
import_functions9.app.http("internalCaseBoxFolderStamp", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "internal/cases/{id}/box-folder",
  handler: (req, ctx) => withServiceAuth(req, ctx, async () => {
    const caseId = (req.params.id ?? "").trim();
    const body = await req.json();
    const boxFolderId = (body.boxFolderId ?? "").trim();
    const boxFolderUrl = (body.boxFolderUrl ?? "").trim() || null;
    if (!caseId || !boxFolderId) {
      return { status: 400, jsonBody: { error: "caseId and boxFolderId required" } };
    }
    const stamped = await query(
      `UPDATE case_
            SET box_folder_id = $2, box_folder_url = $3, updated_at = now()
          WHERE id = $1 AND box_folder_id IS NULL
        RETURNING box_folder_id`,
      [caseId, boxFolderId, boxFolderUrl]
    );
    if (stamped.length > 0) {
      await writeAudit({
        action: AUDIT_ACTION.box_folder_created,
        caseId,
        summary: `Box folder ${boxFolderId} linked to case`,
        after: { boxFolderId, boxFolderUrl }
      });
      return { status: 200, jsonBody: { applied: true, boxFolderId } };
    }
    const cur = await query("SELECT box_folder_id FROM case_ WHERE id = $1", [caseId]);
    return {
      status: 200,
      jsonBody: { applied: false, boxFolderId: cur[0]?.box_folder_id ?? null }
    };
  })
});

// api/src/functions/ai-suggestions.ts
var import_functions10 = require("@azure/functions");
var IMAGE_ROLE_UNKNOWN = 100000003;
import_functions10.app.http("caseAiSuggestions", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "cases/{id}/ai-suggestions",
  handler: withRole("CollisionSpike.User", async (req) => {
    try {
      const caseId = req.params.id;
      const rows = await query(
        `SELECT * FROM ai_suggestion
          WHERE case_id = $1
          ORDER BY (review_state = 'pending') DESC, created_at DESC
          LIMIT 100`,
        [caseId]
      );
      const result = rows.map(rowToAiSuggestion);
      return { status: 200, jsonBody: result };
    } catch {
      return { status: 200, jsonBody: [] };
    }
  })
});
import_functions10.app.http("reviewAiSuggestion", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "ai-suggestions/{id}/review",
  handler: withRole("CollisionSpike.User", async (req, _ctx, claims) => {
    const id = req.params.id;
    const body = await req.json().catch(() => ({}));
    const decision = body.decision;
    if (!isAiReviewState(decision) || decision !== "accepted" && decision !== "rejected") {
      return { status: 400, jsonBody: { error: "decision must be 'accepted' or 'rejected'" } };
    }
    const existing = await query(
      `SELECT id, case_id, evidence_id, suggestion_type, suggested_value, review_state
         FROM ai_suggestion WHERE id = $1`,
      [id]
    );
    if (!existing[0]) return { status: 404, jsonBody: { error: "not found" } };
    const row = existing[0];
    const actor = actorFromClaims(claims);
    if (row.review_state !== "pending") {
      const result2 = {
        id,
        reviewState: row.review_state,
        promoted: false
      };
      return { status: 200, jsonBody: result2 };
    }
    const updated = await query(
      `UPDATE ai_suggestion
          SET review_state = $2, reviewed_by = $3, reviewed_at = now()
        WHERE id = $1 AND review_state = 'pending'
      RETURNING id, review_state`,
      [id, decision, actor ?? null]
    );
    if (!updated[0]) {
      const cur = await query("SELECT review_state FROM ai_suggestion WHERE id = $1", [id]);
      return {
        status: 200,
        jsonBody: { id, reviewState: cur[0]?.review_state ?? "pending", promoted: false }
      };
    }
    let promotion = { promoted: false };
    if (decision === "accepted") {
      promotion = await promoteAcceptedSuggestion(row);
    }
    await writeAudit({
      action: decision === "accepted" ? AUDIT_ACTION.ai_suggestion_accepted : AUDIT_ACTION.ai_suggestion_rejected,
      ...row.case_id ? { caseId: row.case_id } : {},
      summary: `AI suggestion ${row.suggestion_type} ${decision}${promotion.promoted ? ` (promoted -> ${promotion.promotedField})` : ""}`,
      before: { reviewState: "pending" },
      after: {
        reviewState: decision,
        suggestionId: id,
        suggestionType: row.suggestion_type,
        ...promotion.promoted ? { promotedField: promotion.promotedField } : {}
      },
      ...actor ? { actor } : {}
    });
    const result = {
      id,
      reviewState: decision,
      promoted: promotion.promoted,
      ...promotion.promotedField ? { promotedField: promotion.promotedField } : {}
    };
    return { status: 200, jsonBody: result };
  })
});
async function promoteAcceptedSuggestion(row) {
  const evidenceId = row.evidence_id;
  const value = coerceJsonValue(row.suggested_value);
  try {
    if (row.suggestion_type === "image_role" && evidenceId) {
      const role = value?.role;
      const code = role ? imageRoleCodec.toInt(role) : void 0;
      if (code != null) {
        const upd = await query(
          `UPDATE evidence SET image_role_code = $2, updated_at = now()
             WHERE id = $1 AND image_role_code = $3 RETURNING id`,
          [evidenceId, code, IMAGE_ROLE_UNKNOWN]
        );
        if (upd[0]) return { promoted: true, promotedField: "evidence.image_role_code" };
      }
    } else if (row.suggestion_type === "registration" && evidenceId) {
      const visible = value?.visible;
      if (typeof visible === "boolean") {
        const upd = await query(
          `UPDATE evidence SET registration_visible = $2, updated_at = now()
             WHERE id = $1 AND registration_visible IS NULL RETURNING id`,
          [evidenceId, visible]
        );
        if (upd[0]) return { promoted: true, promotedField: "evidence.registration_visible" };
      }
    }
  } catch {
  }
  return { promoted: false };
}
function coerceJsonValue(v) {
  if (typeof v !== "string") return v ?? null;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}
import_functions10.app.http("generateAiSuggestions", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "cases/{id}/ai-suggestions/generate",
  handler: withRole("CollisionSpike.User", async (req, _ctx, claims) => {
    if (!gates.aiAssist() || !gates.aiAssistConfigured()) {
      const result = { generated: 0, reason: "disabled" };
      return { status: 200, jsonBody: result };
    }
    const caseId = req.params.id;
    try {
      const ctx = await query(
        `SELECT vrm, eva_accident_circumstances, eva_claimant_address FROM case_ WHERE id = $1`,
        [caseId]
      );
      if (!ctx[0]) return { status: 404, jsonBody: { error: "not found" } };
      const rawText = [ctx[0].eva_accident_circumstances, ctx[0].eva_claimant_address].filter((s) => typeof s === "string" && s.trim().length > 0).join("\n");
      const scrubbed = scrubPii(rawText, { redactVrm: false });
      const drafts = await callModelForSuggestions({
        caseId,
        vrm: typeof ctx[0].vrm === "string" ? ctx[0].vrm : "",
        scrubbedText: scrubbed.text
      });
      let generated = 0;
      const actor = actorFromClaims(claims);
      for (const d of drafts) {
        const ins = await query(
          `INSERT INTO ai_suggestion
             (case_id, evidence_id, suggestion_type, suggested_value, rationale, confidence, model_version)
           VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7) RETURNING id`,
          [
            caseId,
            d.evidenceId ?? null,
            d.suggestionType,
            JSON.stringify(d.suggestedValue),
            d.rationale ?? null,
            d.confidence ?? null,
            d.modelVersion ?? gates.aiModelDeployment()
          ]
        );
        if (ins[0]) {
          generated += 1;
          await writeAudit({
            action: AUDIT_ACTION.ai_suggestion_created,
            caseId,
            summary: `AI suggestion ${d.suggestionType} created`,
            after: { suggestionId: ins[0].id, suggestionType: d.suggestionType },
            ...actor ? { actor } : {}
          });
        }
      }
      const result = { generated };
      return { status: 200, jsonBody: result };
    } catch {
      const result = { generated: 0, reason: "error" };
      return { status: 200, jsonBody: result };
    }
  })
});
async function callModelForSuggestions(_input) {
  return [];
}
