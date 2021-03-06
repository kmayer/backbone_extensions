//= require backbone_extensions/include
//= require underscore.string
(function() {
  'use strict';

  var exports = this,
      _ = exports._,
      Backbone = exports.Backbone;

  var fn = {};

  var OMIT_OPTIONS = {
    'class': true,
    'className': true,
    'inverseOf': true,
    'parseName': true,
    'through': true
  };

  function parseResponseWith(key, response) {
    var camelKey = _.str.camelize(key);
    if (response[camelKey]) {
      return {key: camelKey, response: response[camelKey]};
    }

    var underscoreKey = _.str.underscored(key);
    if (response[underscoreKey]) {
      return {key: underscoreKey, response: response[underscoreKey]};
    }

    return {response: null};
  }

  function mixin(namespace, globalOptions) {
    namespace = namespace || exports || {};

    globalOptions = globalOptions || {};

    _.extend(fn, {
      mergeOptions: function() {
        var options = {};

        for (var index = 0, len = arguments.length; index < len; index++) {
          var sourceOptions = arguments[index];

          for (var key in sourceOptions) {
            if (!OMIT_OPTIONS[key]) {
              options[key] = sourceOptions[key];
            }
          }
        }

        return options;
      },

      buildAssociation: function(namespace, associationType, associationName, options) {
        function association() {
          var t = (_.isFunction(options.through) && options.through.call(this)) || _.str.camelize(options.through);
          return this[t] && this[t]() && this[t]()[associationName] && this[t]()[associationName]();
        }

        function through() {
          return options.through && association.call(this);
        }

        function throughCollection() {
          return (this.collection && this.collection[associationName] && this.collection[associationName]()) ||
              (this._options && this._options.collection && this._options.collection[associationName] && this._options.collection[associationName]());
        }

        function createAssociation() {
          var self = this;
          var newOptions = fn.mergeOptions(globalOptions, options, this._options);

          if (options.inverseOf) {
            newOptions[_.str.camelize(options.inverseOf)] = function() { return self; };
          }

          var assoc;

          if (options['class']) {
            assoc = new options['class'](null, newOptions);
            through.call(self, association);
            return assoc;
          }

          var className = options.className && _.str.classify(options.className);

          if (className && namespace[className]) {
            assoc = new namespace[className](null, newOptions);
            through.call(self, association);
            return assoc;
          }

          var collectionName = _.str.classify(associationName);

          if (namespace[collectionName]) {
            assoc = new namespace[collectionName](null, newOptions);
            through.call(self, association);
            return assoc;
          }
        }

        var associations = {
          hasMany: createAssociation,
          hasOne: function() { return throughCollection.call(this) || createAssociation.call(this); },
          belongsTo: function() { return throughCollection.call(this) || through.call(this); }
        };

        this.prototype[associationName] = function() {
          return (this._associations || (this._associations = {})) && this._associations[associationName] ||
              (this._associations[associationName] = (this._options && _.result(this._options, associationName)) || associations[associationType].call(this));
        };
      },

      parseAssociation: function(associationType, associationName, options) {

        function through(response) {
          var t = parseResponseWith(_.result(options, 'through'), response).response,
              singularAssociationName = _.singularize && _.singularize(associationName),
              p = options.parseName || singularAssociationName;
          return {response: t && p && _[associationType === 'hasOne' && 'result' || 'pluck'](t, p)};
        }

        if (options.parse) {
          if (!_.has(this, '_parsers')) {
            this._parsers = [];
          }

          var associations = {
            hasMany: function(assocResponse, association, newOptions) {
              association.add(assocResponse, newOptions);
            },
            hasOne: function(assocResponse, association, newOptions) {
              association.clear({silent: true}).set(assocResponse, newOptions);
            }
          };

          if (associations[associationType]) {
            var parsers = this._parsers;

            if (parsers.length === 0) {
              var oldParse = this.prototype.parse;

              this.prototype.parse = function(response) {
                var parsedResponse = oldParse.apply(this, arguments);

                var keys = [];
                keys.length = parsers.length;

                for (var i = 0; i < parsers.length; i++) {
                  var result = parsers[i].parseFn.call(this, parsedResponse);
                  parsers[i].associationFn.call(this, result.response);
                  keys[i] = result.key;
                }

                for (var j = 0; j < keys.length; j++) {
                  if (keys[j]) {
                    delete parsedResponse[keys[j]];
                  }
                }

                return parsedResponse;
              };
            }

            var parser = {};

            if (_.isFunction(options.parse)) {
              parser.parseFn = function(response) {
                return {response: options.parse.call(this, response) };
              };
            } else if (options.through) {
              parser.parseFn = function(response) {
                return through.call(this, response);
              };
            } else if (options.parseName) {
              parser.parseFn = function(response) {
                return parseResponseWith(options.parseName, response);
              };
            } else if (options.className) {
              parser.parseFn = function(response) {
                return parseResponseWith(options.className, response);
              };
            } else {
              parser.parseFn = function(response) {
                return parseResponseWith(associationName, response);
              };
            }

            parser.associationFn = function associationFn(assocResponse) {
              return assocResponse &&
                associations[associationType].call(this, assocResponse, this[associationName](), fn.mergeOptions(globalOptions, options, this._options));
            };

            this._parsers.push(parser);
          }
        }
      }
    });

    return {
      included: function(source) {
        var associations = _.reduce({
          belongsTo: {}, hasMany: {parse: true}, hasOne: {parse: true}
        }, function(associations, defaultOptions, associationType) {
              associations[associationType] = function(name, options) {
                var associationName = _.str.camelize(name);
                options = _.extend({}, defaultOptions, globalOptions, options);
                fn.buildAssociation.call(this, namespace, associationType, associationName, options);
                fn.parseAssociation.call(this, associationType, associationName, options);
                return this;
              };
              return associations;
            }, {});

        _.extend(source, associations, {
          associations: function() {
            var self = this;
            _.chain(arguments).toArray().compact().each(function(options) {
              _.chain(associations).keys().each(function(associationType) {
                if (options[associationType]) {
                  associations[associationType].call(self, options[associationType], _.omit(options, associationType));
                }
              });
            });
          },

          extend: _.wrap(source.extend, function(oldExtend, protoProps, classProps) {
            return _.tap(oldExtend.call(this, protoProps, classProps), function(Klass) {
              var args = (protoProps || {}).associations;
              if (args) {
                Klass.associations.apply(Klass, _.flatten([args]));
              }
            });
          })
        });

        source.prototype.initialize = _.wrap(source.prototype.initialize, function(oldInitialize, attrsOrModels, options) {
          this._options = this._options || _.clone(options);
          oldInitialize.call(this, attrsOrModels, options);
        });
      }
    };
  }
  mixin.fn = fn;

  Backbone.extensions = _.extend(Backbone.extensions || {}, {associations: mixin});
}).call(this);
