exports.handler = ({ exit }, context) => {
	if (exit) {
		process.exit(1);
	} else {
		return { hi: true};
	}
};
