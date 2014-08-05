var mongoClient = require('mongodb').MongoClient,
  mubsub = require('mubsub'),
  config = require('./conf/config'),
  Hipchatter = require('hipchatter');

var hipchatter = new Hipchatter(process.env.HIPCHAT_TOKEN);


mongoClient.connect('mongodb://' + config.mongo_host + ':' + config.mongo_port + '/' + config.mongo_database, function(err, conn) {
  if(err){
    console.log(err.message);
    throw new Error(err);
  } else {
    db = conn;
    var channel = mubsub(db).channel('pubsub');
    channel.on('error', console.error);
    main(channel);
  }
});


function main(mongopubsub) {
  var opts;

  mongopubsub.subscribe('events', function (event) {
    console.log(event);
    if(event.type == 'trigger' && (event.level == 'alarmed' || event.level == 'fired')) {
      opts = {
        message: 'Server ' + event.hostname + ' ' + event.level + ' with ' + event.value + ' ' + event.sensor,
        color: 'red',
        token: process.env.HIPCHAT_TOKEN_ROOM
      };
      hipchatter.notify(process.env.HIPCHAT_ROOM, opts, function(err){});
    } else if(event.type == 'feed') {
      opts = {
        message: 'Feed ' + event.feed + ' reporting ' + event.url,
        color: 'red',
        token: process.env.HIPCHAT_TOKEN_ROOM
      };
      hipchatter.notify(process.env.HIPCHAT_ROOM, opts, function(err){});
    } else if(event.type == 'unlock') {
      opts = {
        message: 'Unlock requested: ' + event.message,
        color: 'yellow',
        token: process.env.HIPCHAT_TOKEN_ROOM
      };
      hipchatter.notify(process.env.HIPCHAT_ROOM, opts, function(err){});
    }
  });

  var last = new Date().getTime();

  setInterval(function() {
    hipchatter.history(process.env.HIPCHAT_ROOM, function(err, history) {
      var aux = history.items.filter(function(el) {
        return el.from !== 'Jarvis' && el.from !== 'Icinga' && new Date(el.date).getTime() > last && el.message.toLowerCase().indexOf('@jarvis ') !== -1;
      });
      if(aux.length > 0) {
        last = new Date(aux[aux.length - 1].date).getTime();
        for (var i = 0; i < aux.length; i++) {
          processMsg(aux[i]);
        }
      }
      //console.log(aux);
    });
  }, 15000);

  function processMsg(msg) {
    var msgd = msg.message.trim().split(' ');
    if(msgd.length == 4 && msgd[1].toLowerCase() === 'unlock') {
      var aux = {
        hostname: msgd[2],
        ip: msgd[3]
      };
      mongopubsub.publish('unlock', aux);
    } else if(msgd.length == 2 && msgd[1].toLowerCase() === 'ping') {
      var opts = {
        message: 'Pong...',
        color: 'green',
        token: process.env.HIPCHAT_TOKEN_ROOM
      };
      hipchatter.notify(process.env.HIPCHAT_ROOM, opts, function(err){});
    }
  }

  /*
  mongopubsub.subscribe('messages', function (message) {
    console.log(message);
  });
  */

  console.log('Notifier started.');
}
