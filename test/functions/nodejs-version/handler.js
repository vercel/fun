exports.handler = (event, context, callback) => {
	callback(null, process.versions);
};
