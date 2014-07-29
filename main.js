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
    if(event.type == 'trigger' && event.level == 'alarmed') {
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
    }
  });


  /*
  mongopubsub.subscribe('messages', function (message) {
    console.log(message);
  });
  */

  console.log('Notifier started.');
}
