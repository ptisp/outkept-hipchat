var mongoClient = require('mongodb').MongoClient,
  mubsub = require('mubsub'),
  config = require('./conf/config'),
  Hipchatter = require('hipchatter');

var hipchatter = new Hipchatter(process.env.HIPCHAT_TOKEN);
var ignored = [];

mongoClient.connect('mongodb://' + config.mongo_host + ':' + config.mongo_port + '/' + config.mongo_database, function(err, conn) {
  if(err){
    console.log(err.message);
    throw new Error(err);
  } else {
    main(conn);
  }
});


function main(db) {
  var opts;

  var mongopubsub = mubsub(db).channel('pubsub');

  mongopubsub.on('error', console.error);

  mongopubsub.subscribe('events', function (event) {
    console.log(event);
    if(event.type == 'trigger' && (event.level == 'alarmed' || event.level == 'fired') && ignored.indexOf(event.hostname) === -1) {
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
    } else if(event.type == 'csf') {
      opts = {
        message: event.message,
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
      mongopubsub.publish('csf', {
        type: 'unlock',
        hostname: msgd[2],
        ip: msgd[3]
      });
    } else if(msgd.length >= 5 && msgd[1].toLowerCase() === 'lock') {
      var reason = '';
      for (var i = 4; i < msgd.length; i++) {
        reason = reason + ' ' + msgd[i];
      }
      reason.trim();
      mongopubsub.publish('csf', {
        type: 'lock',
        hostname: msgd[2],
        ip: msgd[3],
        reason: reason
      });
    } else if(msgd.length == 2 && msgd[1].toLowerCase() === 'ping') {
      var opts = {
        message: 'Pong...',
        color: 'green',
        token: process.env.HIPCHAT_TOKEN_ROOM
      };
      hipchatter.notify(process.env.HIPCHAT_ROOM, opts, function(err){});
    } else if(msgd.length == 3 && msgd[1].toLowerCase() === 'mute') {
      ignored.push(msgd[2]);
      var opts = {
        message: msgd[2] + ' was muted.',
        color: 'green',
        token: process.env.HIPCHAT_TOKEN_ROOM
      };
      hipchatter.notify(process.env.HIPCHAT_ROOM, opts, function(err){});
    } else if(msgd.length == 3 && msgd[1].toLowerCase() === 'unmute') {
      var ind = ignored.indexOf(msgd[2]);
      if(ind != -1) {
        ignored.splice(ind, 1);
        var opts = {
          message: msgd[2] + ' was unmuted.',
          color: 'green',
          token: process.env.HIPCHAT_TOKEN_ROOM
        };
        hipchatter.notify(process.env.HIPCHAT_ROOM, opts, function(err){});
      } else {
        var opts = {
          message: msgd[2] + ' is not muted.',
          color: 'yellow',
          token: process.env.HIPCHAT_TOKEN_ROOM
        };
        hipchatter.notify(process.env.HIPCHAT_ROOM, opts, function(err){});
      }
    } else if(msgd.length == 3 && msgd[1].toLowerCase() === 'feeds') {
      db.collection('feeds').find({}).sort({date: -1}).limit(parseInt(msgd[2])).toArray(function(err, feeds) {
        var opts = {
          message: feeds.toString(),
          color: 'green',
          token: process.env.HIPCHAT_TOKEN_ROOM
        };
        hipchatter.notify(process.env.HIPCHAT_ROOM, opts, function(err){});
      });
    } else if(msgd.length == 2 && msgd[1].toLowerCase() === 'muted') {
      var opts = {
        message: ignored.toString(),
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
