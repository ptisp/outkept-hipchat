var mongoClient = require('mongodb').MongoClient,
  config = require('./conf/config'),
  Hipchatter = require('hipchatter'),
  redis = require('redis');

var hipchatter = new Hipchatter(process.env.HIPCHAT_TOKEN);
var ignored = [];
var notified = [];


mongoClient.connect('mongodb://' + config.mongo_host + ':' + config.mongo_port + '/' + config.mongo_database, function(err, conn) {
  if (err) {
    console.log(err.message);
    throw new Error(err);
  } else {
    main(conn);
  }
});

function main(db) {
  var opts;

  var subscriber = redis.createClient();
  subscriber.subscribe('events');

  subscriber.on('message', function (channel, event) {
    console.log(event);
    event = JSON.parse(event);
    if (event.type == 'trigger' && (event.level == 'alarmed' || event.level == 'fired') && ignored.indexOf(event.hostname) === -1) {
      if (processEvent(event)) {
        opts = {
          message: 'Server ' + event.hostname + ' ' + event.level + ' with ' + event.value + ' ' + event.sensor,
          color: 'red',
          token: process.env.HIPCHAT_TOKEN_ROOM
        };
        hipchatter.notify(process.env.HIPCHAT_ROOM, opts, function(err) {});
        notified.push({
          'hostname': event.hostname,
          'time': new Date().getTime() / 1000
        });
      }
    } else if (event.type == 'feed') {
      opts = {
        message: 'Feed ' + event.feed + ' reporting ' + event.url,
        color: 'red',
        token: process.env.HIPCHAT_TOKEN_ROOM
      };
      hipchatter.notify(process.env.HIPCHAT_ROOM, opts, function(err) {});
    } else if (event.type == 'plugins') {
      opts = {
        message: event.message,
        color: 'yellow',
        token: process.env.HIPCHAT_TOKEN_ROOM
      };
      hipchatter.notify(process.env.HIPCHAT_ROOM, opts, function(err) {});
    }
  });

  var last = new Date().getTime();

  setInterval(function() {
    hipchatter.history(process.env.HIPCHAT_ROOM, function(err, history) {
      if (history && history.items && history.items.length > 0) {
        var aux = history.items;

        for (var i = 0; i < aux.length; i++) {
          if (aux[i].message.indexOf('@jarvis') === 0 && new Date(aux[i].date).getTime() > last) {
            console.log(aux[i]);
            last = new Date(aux[i].date).getTime();
            processMsg(aux[i]);
          }
        }
      }
    });
  }, 15000);

  function processEvent(event) {
    var notified = findNotified(event.hostname);
    var now = new Date().getTime() / 1000;
    if (!notified) {
      return true;
    } else if (notified && now - notified.time > 300) {
      removeNotified(event.hostname);
      return true;
    }
    return false;
  }

  function findNotified(hostname) {
    for (var i = 0; i < notified.length; i++) {
      if (notified[i].hostname === hostname) {
        return notified[i];
      }
    }
  }

  function removeNotified(hostname) {
    for (var i = 0; i < notified.length; i++) {
      if (notified[i].hostname === hostname) {
        notified.splice(i, 1);
      }
    }
  }

  function processMsg(msg) {
    var publisher = redis.createClient();

    var msgd = msg.message.trim().replace(/  /g, ' ').split(' ');
    if (msgd.length == 2 && msgd[1].toLowerCase() === 'help') {
      var opts = {
        message: '@jarvis suspend/unsuspend server domain -- @jarvis lock server ip reason -- @jarvis unlock server ip -- @jarvis ping -- @jarvis feeds 10 -- @jarvis muted -- @jarvis mute/unmute server',
        color: 'green',
        token: process.env.HIPCHAT_TOKEN_ROOM
      };
      hipchatter.notify(process.env.HIPCHAT_ROOM, opts, function(err) {});
    } else if (msgd.length == 4 && msgd[1].toLowerCase() === 'suspend') {
      publisher.publish('suspend', JSON.stringify({
        type: 'suspend',
        hostname: msgd[2],
        domain: msgd[3]
      }));
    } else if (msgd.length == 4 && msgd[1].toLowerCase() === 'unsuspend') {
      publisher.publish('suspend', JSON.stringify({
        type: 'unsuspend',
        hostname: msgd[2],
        domain: msgd[3]
      }));
    } else if (msgd.length == 4 && msgd[1].toLowerCase() === 'unlock') {
      publisher.publish('csf', JSON.stringify({
        type: 'unlock',
        hostname: msgd[2],
        ip: msgd[3]
      }));
    } else if (msgd.length >= 5 && msgd[1].toLowerCase() === 'lock') {
      var reason = '';
      for (var i = 4; i < msgd.length; i++) {
        reason = reason + ' ' + msgd[i];
      }
      reason.trim();
      publisher.publish('csf', JSON.stringify({
        type: 'lock',
        hostname: msgd[2],
        ip: msgd[3],
        reason: reason
      }));
    } else if (msgd.length == 2 && msgd[1].toLowerCase() === 'ping') {
      var opts = {
        message: 'Pong...',
        color: 'green',
        token: process.env.HIPCHAT_TOKEN_ROOM
      };
      hipchatter.notify(process.env.HIPCHAT_ROOM, opts, function(err) {});
    } else if (msgd.length == 3 && msgd[1].toLowerCase() === 'mute') {
      ignored.push(msgd[2]);
      var opts = {
        message: msgd[2] + ' was muted.',
        color: 'green',
        token: process.env.HIPCHAT_TOKEN_ROOM
      };
      hipchatter.notify(process.env.HIPCHAT_ROOM, opts, function(err) {});
    } else if (msgd.length == 3 && msgd[1].toLowerCase() === 'unmute') {
      var ind = ignored.indexOf(msgd[2]);
      if (ind != -1) {
        ignored.splice(ind, 1);
        var opts = {
          message: msgd[2] + ' was unmuted.',
          color: 'green',
          token: process.env.HIPCHAT_TOKEN_ROOM
        };
        hipchatter.notify(process.env.HIPCHAT_ROOM, opts, function(err) {});
      } else {
        var opts = {
          message: msgd[2] + ' is not muted.',
          color: 'yellow',
          token: process.env.HIPCHAT_TOKEN_ROOM
        };
        hipchatter.notify(process.env.HIPCHAT_ROOM, opts, function(err) {});
      }
    } else if ((msgd.length == 3 || msgd.length == 2) && msgd[1].toLowerCase() === 'feeds') {
      var limit = parseInt(msgd[2]) || 3;
      db.collection('feeds').find({}).sort({
        date: -1
      }).limit(limit).toArray(function(err, feeds) {
        var aux = '';
        for (var i = 0; i < feeds.length; i++) {
          aux += feeds[i].url + ' --- ';
        }
        aux = aux.substring(0, aux.length - 5);
        var opts = {
          message: 'Last ' + limit + ' feeds: ' + aux,
          color: 'green',
          token: process.env.HIPCHAT_TOKEN_ROOM
        };
        hipchatter.notify(process.env.HIPCHAT_ROOM, opts, function(err) {});
      });
    } else if (msgd.length == 2 && msgd[1].toLowerCase() === 'muted') {
      var opts = {
        message: ignored.toString(),
        color: 'green',
        token: process.env.HIPCHAT_TOKEN_ROOM
      };
      hipchatter.notify(process.env.HIPCHAT_ROOM, opts, function(err) {});
    }
  }


  console.log('Notifier started.');
}
