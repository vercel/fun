exports.pid = (event, context, callback) => {
	callback(null, process.pid);
};
