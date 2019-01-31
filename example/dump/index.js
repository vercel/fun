exports.handler = function (event, context) {
	return { isResponse: true, event, context, env: process.env, versions: process.versions, date: new Date().toString() };
};
