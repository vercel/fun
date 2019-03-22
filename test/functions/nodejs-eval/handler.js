exports.handler = ({ error, code }, context, callback) => {
	if (typeof error === 'string') {
		callback(new Error(error));
	} else {
		const result = eval(code);
		callback(null, { code, result });
	}
};
