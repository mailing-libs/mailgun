var curllib = require('node-libcurl'),
  Curl = curllib.Curl;

var fs = require('fs'), tls = require('tls'), Path = require('path');
var certFilePath = Path.join(__dirname, 'cert.pem')
var tlsData = tls.rootCertificates.join('\n');
fs.writeFileSync(certFilePath, tlsData)

function createLib(execlib, messengerbaselib){
  'use strict';

  var lib = execlib.lib,
    q = lib.q,
    qlib = lib.qlib,
    MailerBase = messengerbaselib.MessengerBase,
    analyzeBounce = require('./bounceanalyzercreator')(execlib),
    analyzeComplaint = require('./complaintanalyzercreator')(execlib);

  function MailGunMailer(config){
    MailerBase.call(this, config);
    this.apikey = config.apikey;
    this.region = config.region; //'us' or 'eu'
    this.domainname = config.domainname; //'mg.allex.io'
    this.from = config.from; //'admin@allex.io'
    if (config.starteddefer) {
      config.starteddefer.resolve(this);
    }
  }
  lib.inherit(MailGunMailer, MailerBase);
  MailGunMailer.prototype.destroy = function(){
    this.from = null;
    this.domainname = null;
    this.region = null;
    this.apikey = null;
    MailerBase.prototype.destroy.call(this);
  };

  MailGunMailer.prototype.commitSingleMessage = function(params){
    var d = q.defer(), ret = d.promise;
    var curl = new Curl();
    curl.setOpt(Curl.option.CAINFO, certFilePath);
    curl.setOpt(Curl.option.USERPWD, 'api:'+this.apikey);
    curl.setOpt(Curl.option.URL, 'https://api.mailgun.net/v3/'+this.domainname+'/messages');
    curl.setOpt(Curl.option.HTTPPOST, [
      {name: 'from', contents: this.from},
      {name: 'to', contents: params.to},
      {name: 'subject', contents: params.subject},
      {name: 'text', contents: params.text},
      {name: 'html', contents: params.html}
    ]);
    curl.on('end', function (status, response, headers, curlobj) {
      curlobj.close();
      if (status == 200) {
        try {
          d.resolve(JSON.parse(response));
        } catch (e) {
          d.reject(new lib.Error('JSON_PARSE_ERROR', response+' could not be parsed'));
        }
        d = null;
        return;
      }
      d.reject(new lib.Error('INVALID_RESPONSE_STATUS', status));
      d = null;
    });
    curl.on('error', function (errortxt, errorcode, curlobj) {
      curlobj.close();
      d.reject(new lib.Error('TRANSMISSION_ERROR', errortxt));
      d = null;
    });
    curl.perform();

    return ret;
  };

  MailGunMailer.prototype.messageIdFromCommitResponse = function (sendingsystemresponse) {
    return sendingsystemresponse.id;
  };
  MailGunMailer.prototype.paramsFromDeliveryNotification = function (sendingsystemdeliverynotification) {
    if (!sendingsystemdeliverynotification) {
      throw new lib.Error('NO_DELIVERY_NOTIFICATION', 'No delivery notification provided');
    }
    if ('Delivery' !== sendingsystemdeliverynotification.notificationType) {
      throw new lib.Error('WRONG_NOTIFICATION_TYPE', sendingsystemdeliverynotification.notificationType+ ' <> Delivery');
    }
    return {
      sendingsystemid: sendingsystemdeliverynotification.mail.messageId,
      sendingsystemnotified: new Date(sendingsystemdeliverynotification.delivery.timestamp).valueOf()
    };
  };
  MailGunMailer.prototype.paramsFromBounceNotification = function (sendingsystembouncenotification) {
    return analyzeBounce(sendingsystembouncenotification, this);
  };
  MailGunMailer.prototype.paramsFromComplaintNotification = function (sendingsystemcomplaintnotification) {
    return analyzeComplaint(sendingsystemcomplaintnotification);
  };
  MailGunMailer.prototype.sendingsystemcode = 'mailgun';
  MailGunMailer.addMethodsToNotifier = function (klass) {
    MailerBase.addMethodsToNotifier(klass, MailGunMailer);
  };

  return {
    mailer: MailGunMailer
  }
}

module.exports = createLib;
