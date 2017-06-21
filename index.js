'use strict';
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var EE = require('events');
var Yallist = require('yallist');
var EOF = Symbol('EOF');
var MAYBE_EMIT_END = Symbol('maybeEmitEnd');
var EMITTED_END = Symbol('emittedEnd');
var CLOSED = Symbol('closed');
var READ = Symbol('read');
var FLUSH = Symbol('flush');
var FLUSHCHUNK = Symbol('flushChunk');
var SD = require('string_decoder').StringDecoder;
var ENCODING = Symbol('encoding');
var DECODER = Symbol('decoder');
var FLOWING = Symbol('flowing');
var RESUME = Symbol('resume');
var BUFFERLENGTH = Symbol('bufferLength');
var BUFFERPUSH = Symbol('bufferPush');
var BUFFERSHIFT = Symbol('bufferShift');
var OBJECTMODE = Symbol('objectMode');
var MiniPass = (function (_super) {
    __extends(MiniPass, _super);
    function MiniPass(options) {
        var _this = _super.call(this) || this;
        _this[FLOWING] = false;
        _this.pipes = new Yallist();
        _this.buffer = new Yallist();
        _this[OBJECTMODE] = options && options.objectMode || false;
        if (_this[OBJECTMODE])
            _this[ENCODING] = null;
        else
            _this[ENCODING] = options && options.encoding || null;
        if (_this[ENCODING] === 'buffer')
            _this[ENCODING] = null;
        _this[DECODER] = _this[ENCODING] ? new SD(_this[ENCODING]) : null;
        _this[EOF] = false;
        _this[EMITTED_END] = false;
        _this[CLOSED] = false;
        _this.writable = true;
        _this.readable = true;
        _this[BUFFERLENGTH] = 0;
        return _this;
    }
    Object.defineProperty(MiniPass.prototype, "bufferLength", {
        get: function () { return this[BUFFERLENGTH]; },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(MiniPass.prototype, "encoding", {
        get: function () { return this[ENCODING]; },
        set: function (enc) {
            var _this = this;
            if (this[OBJECTMODE])
                throw new Error('cannot set encoding in objectMode');
            if (this[ENCODING] && enc !== this[ENCODING] &&
                (this[DECODER] && this[DECODER].lastNeed || this[BUFFERLENGTH]))
                throw new Error('cannot change encoding');
            if (this[ENCODING] !== enc) {
                this[DECODER] = enc ? new SD(enc) : null;
                if (this.buffer.length)
                    this.buffer = this.buffer.map(function (chunk) { return _this[DECODER].write(chunk); });
            }
            this[ENCODING] = enc;
        },
        enumerable: true,
        configurable: true
    });
    MiniPass.prototype.setEncoding = function (enc) {
        this.encoding = enc;
    };
    MiniPass.prototype.write = function (chunk, encoding, cb) {
        if (this[EOF])
            throw new Error('write after end');
        if (typeof encoding === 'function')
            cb = encoding, encoding = 'utf8';
        if (!encoding)
            encoding = 'utf8';
        // fast-path writing strings of same encoding to a stream with
        // an empty buffer, skipping the buffer/decoder dance
        if (typeof chunk === 'string' && !this[OBJECTMODE] &&
            // unless it is a string already ready for us to use
            !(encoding === this[ENCODING] && !this[DECODER].lastNeed)) {
            chunk = new Buffer(chunk, encoding);
        }
        if (Buffer.isBuffer(chunk) && this[ENCODING])
            chunk = this[DECODER].write(chunk);
        try {
            return this.flowing
                ? (this.emit('data', chunk), this.flowing)
                : (this[BUFFERPUSH](chunk), false);
        }
        finally {
            this.emit('readable');
            if (cb)
                cb();
        }
    };
    MiniPass.prototype.read = function (n) {
        try {
            if (this[BUFFERLENGTH] === 0 || n === 0 || n > this[BUFFERLENGTH])
                return null;
            if (this[OBJECTMODE])
                n = null;
            if (this.buffer.length > 1 && !this[OBJECTMODE]) {
                if (this.encoding)
                    this.buffer = new Yallist([
                        Array.from(this.buffer).join('')
                    ]);
                else
                    this.buffer = new Yallist([
                        Buffer.concat(Array.from(this.buffer), this[BUFFERLENGTH])
                    ]);
            }
            return this[READ](n || null, this.buffer.head.value);
        }
        finally {
            this[MAYBE_EMIT_END]();
        }
    };
    MiniPass.prototype[READ] = function (n, chunk) {
        if (n === chunk.length || n === null)
            this[BUFFERSHIFT]();
        else {
            this.buffer.head.value = chunk.slice(n);
            chunk = chunk.slice(0, n);
            this[BUFFERLENGTH] -= n;
        }
        this.emit('data', chunk);
        if (!this.buffer.length && !this[EOF])
            this.emit('drain');
        return chunk;
    };
    MiniPass.prototype.end = function (chunk, encoding, cb) {
        if (typeof chunk === 'function')
            cb = chunk, chunk = null;
        if (typeof encoding === 'function')
            cb = encoding, encoding = 'utf8';
        if (chunk)
            this.write(chunk, encoding);
        if (cb)
            this.once('end', cb);
        this[EOF] = true;
        this.writable = false;
        if (this.flowing)
            this[MAYBE_EMIT_END]();
    };
    // don't let the internal resume be overwritten
    MiniPass.prototype[RESUME] = function () {
        this[FLOWING] = true;
        this.emit('resume');
        if (this.buffer.length)
            this[FLUSH]();
        else if (this[EOF])
            this[MAYBE_EMIT_END]();
        else
            this.emit('drain');
    };
    MiniPass.prototype.resume = function () {
        return this[RESUME]();
    };
    MiniPass.prototype.pause = function () {
        this[FLOWING] = false;
    };
    Object.defineProperty(MiniPass.prototype, "flowing", {
        get: function () {
            return this[FLOWING];
        },
        enumerable: true,
        configurable: true
    });
    MiniPass.prototype[BUFFERPUSH] = function (chunk) {
        if (this[OBJECTMODE])
            this[BUFFERLENGTH] += 1;
        else
            this[BUFFERLENGTH] += chunk.length;
        return this.buffer.push(chunk);
    };
    MiniPass.prototype[BUFFERSHIFT] = function () {
        if (this.buffer.length) {
            if (this[OBJECTMODE])
                this[BUFFERLENGTH] -= 1;
            else
                this[BUFFERLENGTH] -= this.buffer.head.value.length;
        }
        return this.buffer.shift();
    };
    MiniPass.prototype[FLUSH] = function () {
        do { } while (this[FLUSHCHUNK](this[BUFFERSHIFT]()));
        if (!this.buffer.length && !this[EOF])
            this.emit('drain');
    };
    MiniPass.prototype[FLUSHCHUNK] = function (chunk) {
        return chunk ? (this.emit('data', chunk), this.flowing) : false;
    };
    MiniPass.prototype.pipe = function (dest) {
        var _this = this;
        this.pipes.push(dest);
        dest.on('drain', function (_) { return _this[RESUME](); });
        this[RESUME]();
        return dest;
    };
    MiniPass.prototype.addEventHandler = function (ev, fn) {
        return this.on(ev, fn);
    };
    MiniPass.prototype.on = function (ev, fn) {
        try {
            return _super.prototype.on.call(this, ev, fn);
        }
        finally {
            if (ev === 'data' && !this.pipes.length && !this.flowing) {
                this[RESUME]();
            }
        }
    };
    Object.defineProperty(MiniPass.prototype, "emittedEnd", {
        get: function () {
            return this[EMITTED_END];
        },
        enumerable: true,
        configurable: true
    });
    MiniPass.prototype[MAYBE_EMIT_END] = function () {
        if (!this[EMITTED_END] && this.buffer.length === 0 && this[EOF]) {
            this.emit('end');
            this.emit('prefinish');
            this.emit('finish');
            if (this[CLOSED])
                this.emit('close');
        }
    };
    MiniPass.prototype.emit = function (ev, data) {
        var _this = this;
        if (ev === 'data') {
            if (!data)
                return;
            if (this.pipes.length)
                this.pipes.forEach(function (dest) { return dest.write(data) || _this.pause(); });
        }
        else if (ev === 'end') {
            if (this[DECODER]) {
                data = this[DECODER].end();
                if (data) {
                    this.pipes.forEach(function (dest) { return dest.write(data); });
                    _super.prototype.emit.call(this, 'data', data);
                }
            }
            this.pipes.forEach(function (dest) {
                if (dest !== process.stdout && dest !== process.stderr)
                    dest.end();
            });
            this[EMITTED_END] = true;
            this.readable = false;
        }
        else if (ev === 'close') {
            this[CLOSED] = true;
            // don't emit close before 'end' and 'finish'
            if (!this[EMITTED_END])
                return;
        }
        var args = new Array(arguments.length);
        args[0] = ev;
        args[1] = data;
        if (arguments.length > 2) {
            for (var i = 2; i < arguments.length; i++) {
                args[i] = arguments[i];
            }
        }
        try {
            return _super.prototype.emit.apply(this, args);
        }
        finally {
            if (ev !== 'end')
                this[MAYBE_EMIT_END]();
        }
    };
    return MiniPass;
}(EE));
module.exports = MiniPass;
