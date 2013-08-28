/**
 * Initializes directories, installs dependencies then starts all
 * configured servers for the Hoodie application
 */

var path = require('path');
var fs = require('fs');
var async = require('async');
var domain = require('domain');
var clc = require('cli-color');

var utils = require('./utils');
var couch = require('./couch');
var server = require('./server');
var installer = require('./installer');
var localtld = require('./localtld');
var plugins = require('./plugins');
var nodejitsu_server = require('./nodejitsu_server');


/**
 * Initializes and starts a new Hoodie app server
 */

exports.init = function (config, callback) {
  var app_domain = domain.create();

  // wrap in top-level domain, otherwise we sometimes don't get uncaught
  // exceptions printed in node 0.10.x
  app_domain.run(function () {

    // register services with local-tld
    localtld(config, function (err, config) {
      if (err) {
        return callback(err);
      }

      // configuration for the main www server
      var www_link = (config.local_tld ?
          config.www_local_url:
          'http://' + config.host + ':' + config.www_port
      );

      var hoodieBlue = clc.underline.xterm(25);
      var www_link_colored = hoodieBlue(www_link);

      var www = server({
        name: 'www',
        host: config.host,
        port: config.www_port,
        root: path.resolve(config.project_dir, config.www_root),
        listen: !(config.run_nodejitsu_server),
        message: (config.boring ?
          'WWW:   ' + www_link:
          'WWW:   ' + www_link_colored
        )
      });

      // configuration for the admin server
      var admin_link = (config.local_tld ?
          config.admin_local_url:
          'http://' + config.host + ':' + config.admin_port
      );

      var admin_link_colored = hoodieBlue(admin_link);
      var admin = server({
        name: 'admin',
        host: config.host,
        port: config.admin_port,
        root: path.resolve(__dirname, '../node_modules/hoodie-pocket/www'),
        listen: !(config.run_nodejitsu_server),
        message: (config.boring ?
          'Admin: ' + admin_link:
          'Admin: ' + admin_link_colored
        )
      });

      // start the app
      console.log('Initializing...');
      async.applyEachSeries([
        utils.ensurePaths,
        utils.exitIfSudo,
        couch.start,
        installer.install,
        www,
        admin,
        nodejitsu_server,
        plugins.startAll
      ],
      config, callback);
    });
  });

  // make sure we print a stack trace in node 0.10.x
  app_domain.on('error', function (err) {
    console.error(err.stack || err.toString());
    process.exit(1);
  });

};

/**
 * write app config to stack.json
 */

exports.writeConfig = function (config, callback) {

  var stack = {
    couch: {
      port: Number(config.couch.port),
      host: config.host
    },
    www: {
      port: config.www_port,
      host: config.host
    },
    admin: {
      port: config.admin_port,
      host: config.host
    }
  };

  fs.writeFile(config.project_dir + '/data/stack.json', JSON.stringify(stack), function (err) {
    if (err) {
      return callback(new Error(
        'Hoodie could not write stack.json.\n' +
        'Please try again.'
      ));
    } else {
      return callback();
    }
  });

};

