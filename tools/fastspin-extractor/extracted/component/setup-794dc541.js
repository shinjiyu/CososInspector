var originalSystemInstantiate = System.instantiate;

System.instantiate = function instantiate() {

  return originalSystemInstantiate.apply(System, arguments)
}
;

System.import("../../../fscommon/components/h5app/js/index-legacy-a1792e59.js");