function createLib(execlib){
  return execlib.loadDependencies('client', ['communication:messengerbase:lib'], require('./libindex').bind(null, execlib));
}

module.exports = createLib;
