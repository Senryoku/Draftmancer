// Copyright (c) 2013 Pieroxy <pieroxy@pieroxy.net>
// Asyncish version by Job van der Zwan (2018) - JobLeonard https://gist.github.com/JobLeonard/4bf109f038543a5ca1aabfdce3deab1b
// This work is free. You can redistribute it and/or modify it
// under the terms of the WTFPL, Version 2
// For more information see LICENSE.txt or http://www.wtfpl.net/
//
// For more information, the home page:
// http://pieroxy.net/blog/pages/lz-string/testing.html
//
// LZ-based compression algorithm, version 2.0 RC
var LZStrAsync = (function () {
	// private property
	var i = 0,
	  fromCharCode = String.fromCharCode,
	  reverseDict = {},
	  base = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+",
	  Base64CharArray = (base + "/=").split(''),
	  UriSafeCharArray = (base + "-$").split('');
  
  
	while (i < 65) {
	  if (i > 62) {
		reverseDict[UriSafeCharArray[i].charCodeAt(0)] = i;
	  }
	  reverseDict[Base64CharArray[i].charCodeAt(0)] = i++;
	}
  
	function makeStream(bitsPerChar, getCharFromInt) {
	  return {
		data: [],
		val: 0,
		pos: 0,
		bitsPerChar: bitsPerChar,
		getCharFromInt: getCharFromInt,
	  };
	}
  
  
	function streamBits(stream, value, numBitsMask) {
	  for (var i = 0; numBitsMask >>= 1; i++) {
		// shifting has precedence over bitmasking
		stream.val = value >> i & 1 | stream.val << 1;
		if (++stream.pos === stream.bitsPerChar) {
		  stream.pos = 0;
		  stream.data.push(stream.getCharFromInt(stream.val));
		  stream.val = 0;
		}
	  }
	}
  
	// zero-delay timeOut
	var defer = window.setZeroTimeout ? window.setZeroTimeout :
	  (function () {
		// Only add setZeroTimeout to the window object, 
		// and hide everything else in a closure.
		// make it realy unlikely we get conflicting messageNames
		var messageName = "zero-timeout-" + ((Math.random()*0x10000000000000000)).toString(36);
		var timeouts = [];
  
		/** Like setTimeout, but only takes a function argument.  There's
		 * no time argument (always zero) and no arguments (you have to
		 * use a closure).
		 * @param {function} fn function to be called
		 */
		function setZeroTimeout(fn) {
		  timeouts.push(fn);
		  window.postMessage(messageName, "*");
		}
  
		function handleMessage(event) {
		  if (event.source == window && event.data == messageName) {
			event.stopPropagation();
			if (timeouts.length > 0) {
			  var fn = timeouts.shift();
			  fn();
			}
		  }
		}
  
		window.addEventListener("message", handleMessage, true);
  
		// Add the one thing we want added to the window object.
		window.setZeroTimeout = setZeroTimeout;
  
		return setZeroTimeout;
	  })();
	function deferEmptyString(f) { return defer(function () { f(""); }) }
	function deferNull(f) { return defer(function () { f(null); }) }
	function joined(callback) {
	  return function (res) {
		callback(res.join(''));
	  }
	}
	function getCharFromBase64(a) { return Base64CharArray[a]; }
	function getCharFromURISafe(a) { return UriSafeCharArray[a]; }
	function getCharFromUTF16(a) { return fromCharCode(a + 32); }
	function _node(val) { return { 0x10000: val }; }
	function _compress(uncompressed, callback, maxMillis, bitsPerChar, getCharFromInt) {
	  // no point in compressing without input or a callback to send the result to
	  if (typeof callback !== "function") { return null; }
	  else if (uncompressed == null) {
		callback(null);
	  }
  
	  // default to 20ms per iteration;
	  maxMillis = (maxMillis | 0) || 20;
  
	  var j = 1, value = 0,
		c,
		dictionary = {},
		freshNode = true,
		node = _node(3), // first node will always be initialised like this.
		nextNode,
		dictSize = 3,
		numBitsMask = 0b100,
		stream = makeStream(bitsPerChar, getCharFromInt),
		t0 = new Date().getTime(),
		t1 = t0,
		markStreamEnd = function () {
		  // Mark the end of the stream
		  streamBits(stream, 2, numBitsMask);
		  // Flush the last char
		  stream.val <<= stream.bitsPerChar - stream.pos;
		  stream.data.push(stream.getCharFromInt(stream.val));
		  callback(stream.data);
		},
		finalPrefix = function () {
		  // === Write last prefix to output ===
		  if (freshNode) {
			// character token already written to output
			freshNode = false;
		  } else {
			// write out the prefix token
			streamBits(stream, node[0x10000], numBitsMask);
		  }
  
		  // Is c_finalize2 a new character?
		  var c_finalize2 = uncompressed.charCodeAt(uncompressed.length - 1);
		  if (dictionary[c_finalize2] == undefined) {
			// increase token bitlength if necessary
			if (++dictSize >= numBitsMask) {
			  numBitsMask <<= 1;
			}
  
			// insert "new 8/16 bit charCode" token,
			// see comments above for explanation
			value = c_finalize2 < 256 ? 0 : 1
			streamBits(stream, value, numBitsMask);
			streamBits(stream, c_finalize2, 0b100000000 << value);
		  }
		  // increase token bitlength if necessary
		  if (++dictSize >= numBitsMask) {
			numBitsMask <<= 1;
		  }
		  markStreamEnd();
		},
  
		mainLoop = function () {
		  while (j < uncompressed.length && t1 - t0 < maxMillis) {
			var c_mainLoop = uncompressed.charCodeAt(j++);
			// does the new charCode match an existing prefix?
			nextNode = node[c_mainLoop];
			if (nextNode) {
			  // continue with next prefix
			  node = nextNode;
			} else {
  
			  // Prefix+charCode does not exist in trie yet.
			  // We write the prefix to the bitstream, and add
			  // the new charCode to the dictionary if it's new
			  // Then we set node to the root node matching
			  // the charCode.
  
			  if (freshNode) {
				// Prefix is a freshly added character token,
				// which was already written to the bitstream
				freshNode = false;
			  } else {
				// write out the current prefix token
				value = node[0x10000];
				streamBits(stream, value, numBitsMask);
			  }
  
			  // Is the new charCode a new character
			  // that needs to be stored at the root?
			  if (dictionary[c_mainLoop] == undefined) {
				// increase token bitlength if necessary
				if (++dictSize >= numBitsMask) {
				  numBitsMask <<= 1;
				}
  
				// insert "new 8/16 bit charCode" token,
				// see comments above for explanation
				value = c_mainLoop < 256 ? 0 : 1
				streamBits(stream, value, numBitsMask);
				streamBits(stream, c_mainLoop, value ? 0b10000000000000000 : 0b100000000);
  
				dictionary[c_mainLoop] = _node(dictSize)
				// Note of that we already wrote
				// the charCode token to the bitstream
				freshNode = true;
			  }
			  // add node representing prefix + new charCode to trie
			  node[c_mainLoop] = _node(++dictSize)
			  // increase token bitlength if necessary
			  if (dictSize >= numBitsMask) {
				numBitsMask <<= 1;
			  }
  
			  // set node to first charCode of new prefix
			  node = dictionary[c_mainLoop];
			}
			t1 = new Date().getTime();
		  }
		  if (j == uncompressed.length) {
			defer(finalPrefix);
		  } else {
			t0 = t1;
			defer(mainLoop);
		  }
		},
		timeoutID = -1;
  
	  if (uncompressed.length) {
		// If there is a string, the first charCode is guaranteed to
		// be new, so we write it to output stream, and add it to the
		// dictionary. For the same reason we can initialize freshNode
		// as true, and new_node, node and dictSize as if
		// it was already added to the dictionary (see above).
  
		c = uncompressed.charCodeAt(0);
  
		// == Write first charCode token to output ==
  
		// 8 or 16 bit?
		value = c < 256 ? 0 : 1
  
		// insert "new 8/16 bit charCode" token
		// into bitstream (value 1)
		streamBits(stream, value, numBitsMask);
		streamBits(stream, c, value ? 0b10000000000000000 : 0b100000000);
  
		// Add charCode to the dictionary.
		dictionary[c] = node;
  
		timeoutID = defer(mainLoop);
	  } else {
		timeoutID = defer(markStreamEnd);
	  }
	  return timeoutID;
  
	}
	function _decompress(length, callback, maxMillis, resetBits, getNextValue) {
	  // no point in compressing without input or a callback to send the result to
	  if (typeof callback !== "function") { return null; }
	  // default to 20ms per iteration;
	  maxMillis = (maxMillis | 0) || 20;
	  var dictionary = ['', '', ''],
		enlargeIn = 4,
		dictSize = 4,
		numBits = 3,
		entry = "",
		result = [],
		bits = 0,
		maxpower = 2,
		power = 0,
		c = "",
		data_val = getNextValue(0),
		data_position = resetBits,
		data_index = 1,
		t0 = new Date().getTime(),
		t1 = t0,
		initialize = function () {
		  // Get first token, guaranteed to be either
		  // a new character token (8 or 16 bits)
		  // or end of stream token.
		  while (power != maxpower) {
			// shifting has precedence over bitmasking
			bits += (data_val >> --data_position & 1) << power++;
			if (data_position == 0) {
			  data_position = resetBits;
			  data_val = getNextValue(data_index++);
			}
		  }
  
		  // if end of stream token, return empty string
		  if (bits == 2) {
			return deferEmptyString(callback);
		  }
		  // else, get character
		  return defer(mainLoop);
		},
		mainLoop = function () {
		  maxpower = bits * 8 + 8;
		  bits = power = 0;
		  while (power != maxpower) {
			// shifting has precedence over bitmasking
			bits += (data_val >> --data_position & 1) << power++;
			if (data_position == 0) {
			  data_position = resetBits;
			  data_val = getNextValue(data_index++);
			}
		  }
		  c = fromCharCode(bits);
		  dictionary[3] = c;
		  result.push(c);
  
		  // read rest of string
		  while (data_index <= length && t0 - t1 < maxMillis) {
			// read out next token
			maxpower = numBits;
			bits = power = 0;
			while (power != maxpower) {
			  // shifting has precedence over bitmasking
			  bits += (data_val >> --data_position & 1) << power++;
			  if (data_position == 0) {
				data_position = resetBits;
				data_val = getNextValue(data_index++);
			  }
			}
  
			// 0 or 1 implies new character token
			if (bits < 2) {
			  maxpower = (8 + 8 * bits);
			  bits = power = 0;
			  while (power != maxpower) {
				// shifting has precedence over bitmasking
				bits += (data_val >> --data_position & 1) << power++;
				if (data_position == 0) {
				  data_position = resetBits;
				  data_val = getNextValue(data_index++);
				}
			  }
			  dictionary[dictSize] = fromCharCode(bits);
			  bits = dictSize++;
			  if (--enlargeIn == 0) {
				enlargeIn = 1 << numBits++;
			  }
			} else if (bits == 2) {
			  // end of stream token
			  return callback(result.join(''));
			}
  
			if (bits > dictionary.length) {
			  return callback(null);
			}
			entry = bits < dictionary.length ? dictionary[bits] : c + c.charAt(0);
			result.push(entry);
			// Add c+entry[0] to the dictionary.
			dictionary[dictSize++] = c + entry.charAt(0);
  
			c = entry;
  
			if (--enlargeIn == 0) {
			  enlargeIn = 1 << numBits++;
			}
			t1 = new Date().getTime();
		  }
		  if (data_index < length) {
			t0 = t1;
			return defer(mainLoop);
		  } else {
			return deferEmptyString(callback);
		  }
		};
	  return defer(initialize);
	}
	function _compressToArray(uncompressed, callback, maxMillis) {
	  return _compress(uncompressed, callback, maxMillis, 16, fromCharCode);
	}
	function _decompressFromArray(compressed, callback, maxMillis) {
	  if (compressed == null) return deferEmptyString(callback);
	  if (compressed.length == 0) return deferNull(callback);
	  return _decompress(compressed.length, callback, maxMillis, 16, function (index) { return compressed[index].charCodeAt(0); });
	}
  
	return {
	  compressToBase64: function (input, callback, maxMillis) {
		if (input == null) return deferEmptyString(callback);
		var _callback = function (res) {
		  var i = res.length % 4; // To produce valid Base64
		  while (i--) res.push("=");
		  callback(res.join(''));
		};
		return _compress(input, _callback, maxMillis, 6, getCharFromBase64);
	  },
  
	  decompressFromBase64: function (input, callback, maxMillis) {
		if (input == null) deferEmptyString(callback);
		if (input == "") deferNull(callback);
		return _decompress(input.length, callback, maxMillis, 6, function (index) { return reverseDict[input.charCodeAt(index)]; });
	  },
  
	  compressToUTF16: function (input, callback, maxMillis) {
		if (input == null) return deferEmptyString(callback);
		var _callback = function (res) {
		  res.push(" ");
		  callback(res.join(''));
		}
		return _compress(input, _callback, maxMillis, 15, getCharFromUTF16);
	  },
  
	  decompressFromUTF16: function (compressed, callback, maxMillis) {
		if (compressed == null) return deferEmptyString(callback);
		if (compressed == "") return deferNull(callback);
		return _decompress(compressed.length, callback, maxMillis, 15, function (index) { return compressed.charCodeAt(index) - 32; });
	  },
  
	  //compress into uint8array (UCS-2 big endian format)
	  compressToUint8Array: function (uncompressed, callback, maxMillis) {
		var _callback = function (res) {
		  var buf = new Uint8Array(res.length * 2); // 2 bytes per character
  
		  for (var i = 0, TotalLen = res.length; i < TotalLen; i++) {
			var current_value = res[i].charCodeAt(0);
			buf[i * 2] = current_value >>> 8;
			buf[i * 2 + 1] = current_value & 0xFF;
		  }
		  callback(buf);
		}
		return _compressToArray(uncompressed, _callback, maxMillis);
	  },
  
	  //decompress from uint8array (UCS-2 big endian format)
	  decompressFromUint8Array: function (compressed, callback, maxMillis) {
		if (compressed === null || compressed === undefined) {
		  return _decompressFromArray(compressed);
		} else if (compressed.length == 0) {
		  return deferNull(callback);
		}
		return _decompress(compressed.length, callback, maxMillis, 8, function (index) { return compressed[index]; });
	  },
  
	  //compress into a string that is already URI encoded
	  compressToEncodedURIComponent: function (input, callback, maxMillis) {
		if (input == null) return deferEmptyString(callback);
		return _compress(input, joined(callback), maxMillis, 6, getCharFromURISafe);
	  },
  
	  //decompress from an output of compressToEncodedURIComponent
	  decompressFromEncodedURIComponent: function (input, callback, maxMillis) {
		if (input == null) deferEmptyString(callback);
		if (input == "") return deferNull(callback);
		input = input.replace(/ /g, "+");
		return _decompress(input.length, callback, maxMillis, 6, function (index) { return reverseDict[input.charCodeAt(index)]; });
	  },
  
	  compress: function (uncompressed, callback, maxMillis) {
		return _compressToArray(uncompressed, joined(callback), maxMillis);
	  },
  
	  compressToArray: _compressToArray,
  
	  decompress: function (compressed, callback, maxMillis) {
		if (compressed == null) return deferEmptyString(callback);
		if (compressed == "") return deferNull(callback);
		return _decompress(compressed.length, callback, maxMillis, 16, function (index) { return compressed.charCodeAt(index); });
	  },
  
	  decompressFromArray: _decompressFromArray
	};
  })();
  
  if (typeof define === 'function' && define.amd) {
	define(function () { return LZStrAsync; });
  } else if (typeof module !== 'undefined' && module != null) {
	module.exports = LZStrAsync
  } else if (typeof angular !== 'undefined' && angular != null) {
	angular.module('LZStrAsync', [])
	  .factory('LZStrAsync', function () {
		return LZStrAsync;
	  });
  }