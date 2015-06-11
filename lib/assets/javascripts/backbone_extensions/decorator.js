(function() {
  'use strict';
  var exports = this, _ = exports._, Backbone = exports.Backbone;
  function Decorator(models, options) {
    this._decoratee = models instanceof Backbone.Collection ? models.models : models;
    this.initialize.call(this, models, options);
  }

  function wrapDecorator(fnName) {
    return function(a, b, c, d) {
      var fn = this.constructor.fn[fnName];

      if (Array.isArray(this._decoratee)) {
        var decoratees = this._decoratee,
            len = decoratees.length,
            decorators = [];
        decorators.length = len;
        for (var i = 0; i < len; i++) {
          decorators[i] = fn.call(decoratees[i], a, b, c, d);
        }
        return decorators;
      } else {
        return fn.call(this._decoratee, a, b, c, d);
      }
    };
  }

  _.extend(Decorator, {
    extend: function(protoProps, classProps) {
      var proto = _.chain(protoProps).omit('collection', 'constructor', 'initialize', 'model'),
          wrapped = proto.reduce(function(proto, fn, name) {
            return (proto[name] = wrapDecorator(name)) && proto;
          }, {}).value();
      this.fn = proto.value();
      return _.tap(Backbone.Model.extend.call(this, _.extend(protoProps, wrapped), classProps), function(Klass) {
        _.each(['model', 'collection'], function(type) {
          if (protoProps[type]) {
            protoProps[type].prototype.decorator = function() {
              return new Klass(this);
            };
          }
        });
      });
    }
  }, Backbone.extensions && Backbone.extensions.include || {});

  _.extend(Decorator.prototype, {
    initialize: function(models, options) {}
  });

  Backbone.extensions = _.extend(Backbone.extensions || {}, {Decorator: Decorator});
}).call(this);
