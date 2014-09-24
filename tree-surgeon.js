var global, exports;

var _ = require('lodash');

(function (provides) {
    
    /** decompose -- Takes a plain object and decomposed sub-objects into separate nodes
     *
     * Output structure looks like
     *      {"Root": id,
     *       "Nodes" : { "Key" :{ ... }, ... },
     *       "Relations": [ {"Parent":.., "Child":.., "Kind":...}, ... ]
     *      }
     * */
    provides.decompose = function(obj) {
        var nodesToDecompose = [];
        var nodes = {};
        var relations = [];
        var idx = 0; // used to make unique IDs
        var newId = function(){return "id_" + (idx++);};

        var rootId = obj.ID || newId();
        nodesToDecompose.push([rootId, obj]);

        queueWorkerSync(nodesToDecompose,
            function(pair) {
                var id = pair[0];
                var node = pair[1];
                var out = {"ID":id};
                _.forOwn(node, function(value, key) {
                    if (_.isArray(value)) {
                        if (value.length > 0 && _.isPlainObject(value[0])) {
                            // is an array of objects, treat as multiple child nodes
                            for (var i = 0; i < value.length; i++) {
                                var aId = value[i].ID || newId();
                                relations.push({"Parent":id, "Child":aId, "Kind":key});
                                nodesToDecompose.push([aId, value[i]]);
                            }
                            return; // else fall through to value copying
                        }
                    } 
                    
                    if (_.isPlainObject(value)) {
                        // new node to be decomposed. Add to queue, don't add to parent.
                        var oId = value.ID || newId();
                        relations.push({"Parent":id, "Child":oId, "Kind":key});
                        nodesToDecompose.push([oId, value]);
                    } else {
                        // just some value. Add to general output
                        out[key] = value;
                    }
                });
                nodes[id] = out;
            });

        return {"Root":rootId, "Nodes":nodes, "Relations":relations};
    }

    /** compose -- Takes a decomposed structure and returns a plain object
     *
     * Input structure looks like
     *      {"Root": id,
     *       "Nodes" : { "Key" :{ ... }, ... },
     *       "Relations": [ {"Parent":.., "Child":.., "Kind":...}, ... ]
     *      }
     * */
    provides.compose = function(obj) {
        var parentToChild = _.groupBy(obj.Relations, "Parent");

        var join = function (old, additional) {
            if (old) {
                return (Array.isArray(old)) ? (old.concat([additional])) : ([old, additional]);
            } else {
                return additional;
            }
        };

        var build = function buildRecursive(currentNode) {
            var output = _.clone(obj.Nodes[currentNode]);
            var childNodes = parentToChild[currentNode];
            if (childNodes) {
                for (var i = 0; i < childNodes.length; i++) {
                    var childNode = childNodes[i];
                    output[childNode.Kind] = join(output[childNode.Kind],
                            buildRecursive(childNode.Child));
                }
            }
            return output;
        };

        return build(obj.Root);
    };

    function queueWorkerSync (queue, doWork) {
        var output = [];

        while(queue.length > 0) {
            var work = queue.shift();
            doWork(work);
        };
    };

    function queueWorker (queue, done, doWork) {
        var output = [];

        var trampoline = function (err, result) {
            if (err) {
                return done(err, undefined);
            }

            if (result) {
                output.push(result);
            }

            if (queue.length < 1) {
                return done(undefined, output);
            }

            var work = queue.shift();
            process.nextTick(doWork.bind(this, work, trampoline));
        };
        trampoline(null, null);
    };


})(global || exports || this);