/* Self-contained QR code generator (byte mode, EC level M, versions 1–10).
   Exposes window.qrMatrix(text) -> { size, modules:boolean[][] }.
   Compact port of the canonical model-2 algorithm (MIT, K. Arase). */
(function () {
  // ---- GF(256) ----
  var EXP = [], LOG = [];
  for (var i = 0; i < 8; i++) EXP[i] = 1 << i;
  for (var i = 8; i < 256; i++) EXP[i] = EXP[i - 4] ^ EXP[i - 5] ^ EXP[i - 6] ^ EXP[i - 8];
  for (var i = 0; i < 255; i++) LOG[EXP[i]] = i;
  function gexp(n) { while (n < 0) n += 255; while (n >= 255) n -= 255; return EXP[n]; }
  function glog(n) { return LOG[n]; }

  function Poly(num, shift) {
    var offset = 0; while (offset < num.length && num[offset] === 0) offset++;
    this.num = [];
    for (var i = 0; i < num.length - offset + shift; i++) this.num.push(0);
    for (var i = 0; i < num.length - offset; i++) this.num[i] = num[i + offset];
  }
  Poly.prototype.get = function (i) { return this.num[i]; };
  Poly.prototype.len = function () { return this.num.length; };
  Poly.prototype.multiply = function (e) {
    var num = [];
    for (var i = 0; i < this.len() + e.len() - 1; i++) num.push(0);
    for (var i = 0; i < this.len(); i++)
      for (var j = 0; j < e.len(); j++)
        num[i + j] ^= gexp(glog(this.get(i)) + glog(e.get(j)));
    return new Poly(num, 0);
  };
  Poly.prototype.mod = function (e) {
    if (this.len() - e.len() < 0) return this;
    var ratio = glog(this.get(0)) - glog(e.get(0));
    var num = this.num.slice();
    for (var i = 0; i < e.len(); i++) num[i] ^= gexp(glog(e.get(i)) + ratio);
    return new Poly(num, 0).mod(e);
  };
  function rsPoly(ec) {
    var a = new Poly([1], 0);
    for (var i = 0; i < ec; i++) a = a.multiply(new Poly([1, gexp(i)], 0));
    return a;
  }

  // ---- RS block tables, EC level M, versions 1..10 ----
  // each: [ [count, totalCodewords, dataCodewords], ... ]
  var RS_M = {
    1: [[1, 26, 16]], 2: [[1, 44, 28]], 3: [[1, 70, 44]], 4: [[2, 50, 32]],
    5: [[2, 67, 43]], 6: [[4, 43, 27]], 7: [[4, 49, 31]],
    8: [[2, 60, 38], [2, 61, 39]], 9: [[3, 58, 36], [2, 59, 37]], 10: [[4, 69, 43], [1, 70, 44]],
  };
  function rsBlocks(ver) {
    var t = RS_M[ver], list = [];
    for (var k = 0; k < t.length; k++) for (var c = 0; c < t[k][0]; c++) list.push({ total: t[k][1], data: t[k][2] });
    return list;
  }
  function dataCapacity(ver) { var b = rsBlocks(ver), s = 0; for (var i = 0; i < b.length; i++) s += b[i].data; return s; }

  function lenBits(ver) { return ver < 10 ? 8 : 16; }

  // ---- bit buffer ----
  function Buf() { this.buf = []; this.len = 0; }
  Buf.prototype.put = function (n, len) { for (var i = 0; i < len; i++) this.putBit(((n >>> (len - i - 1)) & 1) === 1); };
  Buf.prototype.putBit = function (b) {
    var bi = Math.floor(this.len / 8);
    if (this.buf.length <= bi) this.buf.push(0);
    if (b) this.buf[bi] |= (0x80 >>> (this.len % 8));
    this.len++;
  };

  function createData(ver, dataBytes) {
    var buf = new Buf();
    buf.put(4, 4); // byte mode
    buf.put(dataBytes.length, lenBits(ver));
    for (var i = 0; i < dataBytes.length; i++) buf.put(dataBytes[i], 8);
    var totalData = dataCapacity(ver) * 8;
    if (buf.len + 4 <= totalData) buf.put(0, 4);
    while (buf.len % 8 !== 0) buf.putBit(false);
    while (true) {
      if (buf.len >= totalData) break; buf.put(0xEC, 8);
      if (buf.len >= totalData) break; buf.put(0x11, 8);
    }
    return buf.buf;
  }

  function createBytes(buf, ver) {
    var blocks = rsBlocks(ver), offset = 0, maxDc = 0, maxEc = 0;
    var dcData = [], ecData = [];
    for (var r = 0; r < blocks.length; r++) {
      var dc = blocks[r].data, ec = blocks[r].total - dc;
      maxDc = Math.max(maxDc, dc); maxEc = Math.max(maxEc, ec);
      dcData[r] = []; for (var i = 0; i < dc; i++) dcData[r][i] = 0xff & buf[i + offset];
      offset += dc;
      var rsP = rsPoly(ec);
      var rawP = new Poly(dcData[r], rsP.len() - 1);
      var mod = rawP.mod(rsP);
      ecData[r] = [];
      for (var i = 0; i < rsP.len() - 1; i++) {
        var idx = i + mod.len() - (rsP.len() - 1);
        ecData[r][i] = idx >= 0 ? mod.get(idx) : 0;
      }
    }
    var total = 0; for (var r = 0; r < blocks.length; r++) total += blocks[r].total;
    var out = []; 
    for (var i = 0; i < maxDc; i++) for (var r = 0; r < blocks.length; r++) if (i < dcData[r].length) out.push(dcData[r][i]);
    for (var i = 0; i < maxEc; i++) for (var r = 0; r < blocks.length; r++) if (i < ecData[r].length) out.push(ecData[r][i]);
    return out;
  }

  // ---- module map ----
  function makeMatrix(ver, dataBytes) {
    var size = ver * 4 + 17;
    var mods = [];
    for (var r = 0; r < size; r++) { mods[r] = []; for (var c = 0; c < size; c++) mods[r][c] = null; }

    function probe(row, col) {
      for (var r = -1; r <= 7; r++) for (var c = -1; c <= 7; c++) {
        if (row + r < 0 || size <= row + r || col + c < 0 || size <= col + c) continue;
        mods[row + r][col + c] = (0 <= r && r <= 6 && (c === 0 || c === 6)) ||
          (0 <= c && c <= 6 && (r === 0 || r === 6)) || (2 <= r && r <= 4 && 2 <= c && c <= 4);
      }
    }
    probe(0, 0); probe(size - 7, 0); probe(0, size - 7);

    // timing
    for (var i = 8; i < size - 8; i++) {
      if (mods[i][6] === null) mods[i][6] = i % 2 === 0;
      if (mods[6][i] === null) mods[6][i] = i % 2 === 0;
    }
    // alignment (versions 2-6 single at center; v7-10 add more)
    var apos = ALIGN[ver] || [];
    for (var i = 0; i < apos.length; i++) for (var j = 0; j < apos.length; j++) {
      var row = apos[i], col = apos[j];
      if (mods[row][col] !== null) continue;
      for (var r = -2; r <= 2; r++) for (var c = -2; c <= 2; c++)
        mods[row + r][col + c] = (r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0));
    }

    var data = createBytes(dataBytes, ver);
    var best = -1, bestPattern = 0;
    for (var p = 0; p < 8; p++) {
      var trial = clone(mods);
      setupFormat(trial, size, p);
      if (ver >= 7) setupVersion(trial, size, ver);
      mapData(trial, size, data, p);
      var lost = lostPoint(trial, size);
      if (best < 0 || lost < best) { best = lost; bestPattern = p; }
    }
    setupFormat(mods, size, bestPattern);
    if (ver >= 7) setupVersion(mods, size, ver);
    mapData(mods, size, data, bestPattern);
    return { size: size, modules: mods };
  }

  var ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };

  function clone(m) { return m.map(function (r) { return r.slice(); }); }

  function mask(p, i, j) {
    switch (p) {
      case 0: return (i + j) % 2 === 0;
      case 1: return i % 2 === 0;
      case 2: return j % 3 === 0;
      case 3: return (i + j) % 3 === 0;
      case 4: return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
      case 5: return (i * j) % 2 + (i * j) % 3 === 0;
      case 6: return ((i * j) % 2 + (i * j) % 3) % 2 === 0;
      case 7: return ((i * j) % 3 + (i + j) % 2) % 2 === 0;
    }
  }

  function mapData(mods, size, data, p) {
    var inc = -1, row = size - 1, bitIndex = 7, byteIndex = 0;
    for (var col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      while (true) {
        for (var c = 0; c < 2; c++) {
          if (mods[row][col - c] === null) {
            var dark = false;
            if (byteIndex < data.length) dark = ((data[byteIndex] >>> bitIndex) & 1) === 1;
            if (mask(p, row, col - c)) dark = !dark;
            mods[row][col - c] = dark;
            bitIndex--;
            if (bitIndex === -1) { byteIndex++; bitIndex = 7; }
          }
        }
        row += inc;
        if (row < 0 || size <= row) { row -= inc; inc = -inc; break; }
      }
    }
  }

  function bchFormat(data) {
    var d = data << 10;
    while (bitLen(d) - bitLen(0x537) >= 0) d ^= (0x537 << (bitLen(d) - bitLen(0x537)));
    return ((data << 10) | d) ^ 0x5412;
  }
  function bchVersion(data) {
    var d = data << 12;
    while (bitLen(d) - bitLen(0x1f25) >= 0) d ^= (0x1f25 << (bitLen(d) - bitLen(0x1f25)));
    return (data << 12) | d;
  }
  function bitLen(n) { var c = 0; while (n !== 0) { c++; n >>>= 1; } return c; }

  function setupFormat(mods, size, p) {
    var ECM = 0; // level M => 00
    var bits = bchFormat((ECM << 3) | p);
    for (var i = 0; i < 15; i++) {
      var mod = ((bits >> i) & 1) === 1;
      if (i < 6) mods[i][8] = mod; else if (i < 8) mods[i + 1][8] = mod; else mods[size - 15 + i][8] = mod;
      if (i < 8) mods[8][size - i - 1] = mod; else if (i < 9) mods[8][15 - i - 1 + 1] = mod; else mods[8][15 - i - 1] = mod;
    }
    mods[size - 8][8] = true;
  }
  function setupVersion(mods, size, ver) {
    var bits = bchVersion(ver);
    for (var i = 0; i < 18; i++) {
      var mod = ((bits >> i) & 1) === 1;
      mods[Math.floor(i / 3)][i % 3 + size - 8 - 3] = mod;
      mods[i % 3 + size - 8 - 3][Math.floor(i / 3)] = mod;
    }
  }

  function lostPoint(mods, size) {
    var lost = 0;
    for (var row = 0; row < size; row++) for (var col = 0; col < size; col++) {
      var same = 0, dark = mods[row][col];
      for (var r = -1; r <= 1; r++) { if (row + r < 0 || size <= row + r) continue;
        for (var c = -1; c <= 1; c++) { if (col + c < 0 || size <= col + c) continue; if (r === 0 && c === 0) continue;
          if (dark === mods[row + r][col + c]) same++; } }
      if (same > 5) lost += (3 + same - 5);
    }
    for (var row = 0; row < size - 1; row++) for (var col = 0; col < size - 1; col++) {
      var cnt = 0;
      if (mods[row][col]) cnt++; if (mods[row + 1][col]) cnt++; if (mods[row][col + 1]) cnt++; if (mods[row + 1][col + 1]) cnt++;
      if (cnt === 0 || cnt === 4) lost += 3;
    }
    var dc = 0;
    for (var row = 0; row < size; row++) for (var col = 0; col < size; col++) if (mods[row][col]) dc++;
    var ratio = Math.abs(100 * dc / size / size - 50) / 5;
    lost += ratio * 10;
    return lost;
  }

  function toBytes(str) {
    var out = [], s = unescape(encodeURIComponent(str));
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }

  window.qrMatrix = function (text) {
    var bytes = toBytes(text);
    var ver = 1;
    while (ver <= 10) {
      var cap = dataCapacity(ver);
      var need = Math.ceil((4 + lenBits(ver) + bytes.length * 8) / 8);
      if (need <= cap) break; ver++;
    }
    if (ver > 10) ver = 10;
    var dataBytes = createData(ver, bytes);
    return makeMatrix(ver, dataBytes);
  };
})();
