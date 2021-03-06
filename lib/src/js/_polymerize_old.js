define(['dart_sdk', 'polymer_element/polymer_element',
    'polymer_element/utils'
  ],
  function(sdk,
    dart_polymer_element, utils) {

    // PATCHING THE SDK ...
    sdk.html.Element.prototype.created = function() {
      //this[Symbol('_created')].call(this);
    }


    // TODO : BAD HACK NEED TO IMPROVE THIS
    window._addEventDetail = function(ev, detail) {
      Object.defineProperty(ev, 'detail', {
        value: sdk.js._convertToDart(detail)
      });
    };

    const _owner = Symbol('_owner');
    const _cache = Symbol('_cache');
    const _overridden = Symbol('_overridden');

    function wrapMethod(fun) {
      return function() {
        // Convert args
        let newArgs = [];
        for (let x of arguments) {
          newArgs.push(sdk.js._convertToDart(x));
        }

        return sdk.js._convertToJS(fun.apply(this, newArgs));
      };
    }

    function wrapProperties(jsClass, dartClass) {
      jsClass.prototype[_overridden] = {};
      jsClass.prototype['ddcCallOverridden'] = function(name, args) {
        // Convert args
        let newArgs = [];
        for (let x of args) {
          newArgs.push(sdk.js._convertToJS(x));
        }

        return sdk.js._convertToDart(this[_overridden][name].apply(this,
          newArgs));
      }


      // Copy dart properties and method to this element prototype
      // Gettter and setter need to be implemented in the `__dataProto`
      // because they get ovverridden by polymer.
      for (let p of Object.getOwnPropertyNames(dartClass.prototype).concat(
          Object.getOwnPropertySymbols(dartClass.prototype))) {

        if (p == 'constructor') {
          continue;
        }

        let descr = Object.getOwnPropertyDescriptor(
          dartClass.prototype, p);

        let jsDescr = jsClass.getOwnPropertyDescriptor(p);

        if (jsDescr) {
          continue;
        }

        // Getter and setter should be executed on the element not the model
        if (descr.get || descr.set) {
          Object.defineProperty(res.prototype.__dataProto, p, {
            get: wrapFunction(targetDescr.get),
            set: wrapFunction(targetDescr.set)
          });
        }

        if (res.prototype[p]) {
          overridden[p] = res.prototype[p];
        }

        if (descr.value && descr.value.__proto__ == Function.prototype) {
          let fun = descr.value;

          descr.value = function() {
            // Convert args
            let newArgs = [];
            for (let x of arguments) {
              newArgs.push(sdk.js._convertToDart(x));
            }

            return sdk.js._convertToJS(fun.apply(this, newArgs));
          }

        }

        Object.defineProperty(res.prototype, p, descr);

      }

    }

    function importDart(jsClass, dartClass, noPolymerMode) {
      let overridden = {};
      let res = class extends jsClass {
        constructor() {
          super();
          // TODO(dam0vm3nt)
          // __data is created in "super" using "__dataProto".
          // "_owner" should be set before, but there isn't a simple
          // way to do that without patching "polymer" itself.
          // This is a problem only for setter and getter that are not
          // correctly initialized.
          if (this.__data) {
            this.__data[_owner] = this;
          }
          this['new'] && this['new'].apply(this);

        }

        __callSuper(name, args) {
          // We call this from JSInterop so we need to "deinterop" it
          let newArgs = utils.deinteropList(args);
          return overridden[name] && sdk.js._convertToJS(overridden[name]
            .apply(this, newArgs));
        }
      };

      if (!noPolymerMode) {
        res.prototype.__dataProto = {};
      }

      // Copy dart properties and method to this element prototype
      // Gettter and setter need to be implemented in the `__dataProto`
      // because they get ovverridden by polymer.
      for (let p of Object.getOwnPropertyNames(dartClass.prototype).concat(
          Object.getOwnPropertySymbols(dartClass.prototype))) {

        if (p != 'constructor') { // Fortunately dart constructor will only call super and ['new'], we can regenerate it
          let descr = Object.getOwnPropertyDescriptor(
            dartClass.prototype, p);

          // Getter and setter should be executed on the element not the model
          if ((descr.get || descr.set) && !noPolymerMode) {
            Object.defineProperty(res.prototype.__dataProto, p, {
              get: descr.get && function() {
                if (this[_owner]) {
                  return descr.get.call(this[_owner]);
                } else {
                  return this[_cache] && this[_cache][p];
                }
              },
              set: descr.set && function(v) {
                if (this[_owner]) {
                  descr.set.call(this[_owner], v);
                } else {
                  this[_cache] = this[_cache] || {};
                  this[_cache][p] = v;
                }
              }

            });

          }

          if (res.prototype[p]) {
            overridden[p] = res.prototype[p];
          }

          /*
                  if (descr.value && descr.value.__proto__ == Function.prototype) {
                    let fun = descr.value;

                    descr.value = function() {
                      // Convert args
                      let newArgs = [];
                      for (let x of arguments) {
                        newArgs.push(sdk.js._convertToDart(x));
                      }

                      return sdk.js._convertToJS(fun.apply(this, newArgs));
                    }

                  }
                  */

          Object.defineProperty(res.prototype, p, descr);

        }
      }

      return res;
    }

    //
    // There should be a better way to do this.
    function typeOf(sig) {
      if (sig == sdk.core.int) {
        return Number;
      }

      if (sig == sdk.core.String) {
        return String;
      }

      if (sig == sdk.core.List) {
        return Array;
      }


      return Object;
    }

    // Maps "Polymer.Element" to dart class. The dart class MUST extends HTMLElement.
    //sdk.dart.registerExtension(Polymer.Element, dart_polymer_element.polymer_element
    //  .PolymerElement);

    function registerNative(type, tag) {
      let ele = document.createElement(tag);
      let cons = ele.__proto__.constructor;
      sdk.dart.registerExtension(cons, type);
    }

    // Path dart Type to be DDC compliant

    function _patchTypeForDart(type) {
      Object.defineProperty(type, '_check', {
        value: function(x) {
          return x;
        }
      });
      Object.defineProperty(type, 'as', {
        value: function(x) {
          return x;
        }
      });
    }

    function polymerize(type, tag, config, native, templateUrl) {
      _patchTypeForDart(type);

      if (native) {
        //registerNative(type, tag);

        // Will register the extension as soon as its defined
        /*
        window.customElements.whenDefined(tag).then(function() {
          let cons = window.customElements.get(tag);
          if (cons) {
            sdk.dart.registerExtension(cons, type);
          }
        });
        */
        return;
      }

      // Copy things for dart

      //sdk.dart.registerExtension(m, type);



      customElements.define(tag || type.TAG, class extends type {
        constructor() {
          super();
          if (this.__data) {
            this.__data[_owner] = this;
          }
          this['new'] && this['new'].apply(this);
        }

        static get is() {
          return tag || type.TAG;
        }

        static get config() {
          return config;
        }

      });
    }

    // Patching Polymer.Element for @JS :
    // Adding a fake "new" constructor wanted by Dart to extend this Polymer.Element
    Object.defineProperty(Polymer.Element.prototype, 'new', {
      value: function() {}
    });

    function polymerize_(type, tag, config, native, templateUrl) {
      if (native) {
        registerNative(type, tag);
        return;
      }


      let m = importDart(Polymer.Element,
        type);

      /** Actually this will be overridden by the build **/
      let sig = sdk.dart.getFieldSig(type);

      config = config || {};
      let cfg = type.CONFIG;
      config.observers = config.observers || (cfg && cfg.observers);
      config.properties = config.properties || (cfg && cfg.properties) || {};

      // Adding descriptors for props if not already there
      for (let pn in sig) {
        if (!(pn in config.properties)) {
          config.properties[pn] = {
            defined: true,
            type: typeOf(sig[pn])
          }
        }
      }

      // Adding is and config
      Object.defineProperty(m, 'is', {
        get: function() {
          return tag || type.TAG;
        }
      });

      Object.defineProperty(m, 'config', {
        get: function() {
          return config;
        }
      });

      // Copy things for dart

      sdk.dart.registerExtension(m, type);
      customElements.define(m.is, m);


      return m;

    }

    function define(tag, dartClass) {
      //let actualDartClass = sdk.dart.unwrapType(dartClass);
      let m = importDart(window.HTMLElement, dartClass);

      sdk.dart.registerExtension(m, dartClass);
      customElements.define(tag, m);
    }

    // START THE ROOT ISOLATE
    // TODO : Provide a method to start it from dart
    sdk._isolate_helper.startRootIsolate((args) => null, []);

    return {
      register: polymerize,
      define: define
    };
  });
