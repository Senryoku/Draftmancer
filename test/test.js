'use strict'

var expect = require('chai').expect
  , server = require('../server')
  , io = require('socket.io-client')
  , ioOptions = { 
      transports: ['websocket']
    , forceNew: true
    , reconnection: false
  }
  , testMsg = 'HelloWorld'
  , sender
  , receiver
  
describe('Server Events', function() {
  before(function(done){
    // connect two io clients
    sender = io('http://localhost:3000/', Object.assign({query: {
		userID: 'sender', 
		sessionID: 'sessionID',
		userName: 'sender'
	}}, ioOptions));
    receiver = io('http://localhost:3000/', Object.assign({query: {
		userID: 'receiver', 
		sessionID: 'sessionID',
		userName: 'receiver'
	}}, ioOptions));
    	
    // finish beforeEach setup
    done()
  });
  
  after(function(done){
    // disconnect io clients after each test
    sender.disconnect()
    receiver.disconnect()
    done()
  });

  describe('Chat Events', function(){
    it('Clients should receive a message when the `chatMessage` event is emited.', function(done) {
      sender.emit('chatMessage', {text: testMsg})
      receiver.on('chatMessage', function(msg){
        expect(msg.text).to.equal(testMsg)
        done()
      });
    });
  });
  
  describe('Personal options updates', function() {
    it('Clients should receive the updated userName when a user changes it.', function(done) {
      sender.emit('setUserName', 'senderUpdatedUserName')
      receiver.on('updateUser', function(data) {
        expect(data.userID).to.equal('sender');
        expect(data.updatedProperties.userName).to.equal('senderUpdatedUserName');
		receiver.removeListener('updateUser');
        done()
      });
    });
    it('Clients should receive the updated useCollection status.', function(done) {
      sender.emit('useCollection', false);
      receiver.on('updateUser', function(data) {
        expect(data.userID).to.equal('sender');
        expect(data.updatedProperties.useCollection).to.equal(false);
		receiver.removeListener('updateUser');
        done();
      });
    });
    it('Clients should NOT receive an update if the option is not actually changed.', function(done) {
		this.timeout(200 + 100);
		let timeout = setTimeout(() => {
			done();
			receiver.removeListener('updateUser');
		}, 200); 
		sender.emit('useCollection', false);
		receiver.on('updateUser', () => {
			clearTimeout(timeout);
			receiver.removeListener('updateUser');
			done(new Error('Unexpected Call'));
		});
    });
    it('Clients should receive the updated useCollection status.', function(done) {
      sender.emit('useCollection', true);
      receiver.on('updateUser', function(data) {
        expect(data.userID).to.equal('sender');
        expect(data.updatedProperties.useCollection).to.equal(true);
		receiver.removeListener('updateUser');
        done();
      });
    });
  });
});