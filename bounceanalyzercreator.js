function createBounceAnalyzer (execlib) {
  'use strict';

  var lib = execlib.lib;

  function retryTime (type, subtype) {
    switch (type) {
      case 'Transient':
        switch (subtype) {
          case 'General':
            return lib.intervals.Hour;
          default: 
            console.log('For bounceType', type);
            console.log('need to support AWS bounceSubType', subtype, 'to determine the retry time period');
            return lib.intervals.Hour;
        }
        break;
      default: 
        console.log('need to support AWS bounceType', type, 'to determine the retry time period');
        return null;
    }
  }

  function maybeRetry (bouncemsg, ret) {
    var type, subtype;
    if (!bouncemsg) {
      return;
    }
    if (bouncemsg.notificationType !== 'Bounce') {
      return;
    }
    if (!bouncemsg.bounce) {
      return;
    }
    type = bouncemsg.bounce.bounceType;
    if (type === 'Permanent') {
      ret.retryin = null;
      return;
    }
    subtype = bouncemsg.bounce.bounceSubType;
    ret.retryin = retryTime(type, subtype);
  };

  function blacklistAddresser (res, obj) {
    if (!obj) {
      return res;
    }
    if (!obj.emailAddress) {
      return res;
    }
    if (obj.action === 'failed') {
      res.push({recipient: obj.emailAddress, reason: 'invalid'});
      return res;
    }
    res.push(obj.emailAddress);
    return res;
  }

  function maybeToBlacklist (bouncemsg, ret) {
    if (ret.retryin !== null) {
      return;
    }
    if (!bouncemsg) {
      return;
    }
    if (bouncemsg.notificationType !== 'Bounce') {
      return;
    }
    if (!bouncemsg.bounce) {
      return;
    }
    if (!lib.isArray(bouncemsg.bounce.bouncedRecipients)) {
      return;
    }
    ret.toblacklist = bouncemsg.bounce.bouncedRecipients.reduce(blacklistAddresser, []);
  }

  function analyzeBounce (bounce, meessenger) {
    var m, ret;
    if (!bounce) {
      throw new lib.Error('NO_BOUNCE_NOTIFICATION', 'No bounce notification provided');
    }
    if ('Notification' !== bounce.Type) {
      throw new lib.Error('WRONG_NOTIFICATION_TYPE', bounce.Type+ ' <> Notification');
    }
    try {
      m = JSON.parse(bounce.Message);
    } catch (e) {
      throw new lib.Error('MESSAGE_NOT_JSON_PARSEABLE', 'Message was not in JSON format');
    }
    if (!m.mail) {
      console.log('What is the structure of Message?', m);
      throw new lib.Error('UNSUPPORTED_BOUNCE_MESSAGE_STRUCTURE', 'The Message structure is not supported');
    }
    if (!(m.bounce && m.bounce.timestamp)) {
      console.log('What is the structure of Message?', m);
      throw new lib.Error('UNSUPPORTED_BOUNCE_MESSAGE_STRUCTURE', 'The Message structure is not supported');
    }
    ret =  {
      sendingsystemid: m.mail.messageId,
      sendingsystemnotified: new Date(m.bounce.timestamp).valueOf(),
      toblacklist: [],
      retryin: null
    };
    maybeRetry(m, ret);
    maybeToBlacklist(m, ret);
    return ret;
  }

  return analyzeBounce;
}
module.exports = createBounceAnalyzer;
