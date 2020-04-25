const { workerData, parentPort } = require('worker_threads')
const { google } = require('googleapis');
const { options, folder } = workerData;
const fs = require('fs');

const TOKEN_PATH = 'gdrive.token';

const credentials = JSON.parse(fs.readFileSync('credentials.json'));

const token = fs.readFileSync(TOKEN_PATH);

let driveAPI;

if (credentials.type && credentials.type === "service_account") {
	const {
		client_email,
		private_key
	} = credentials;

	const jwtClient = new google.auth.JWT(
		client_email,
		null,
		private_key,
		['https://www.googleapis.com/auth/drive']);

	fs.readFile(TOKEN_PATH, (err, token) => {
		if (err) return getAccessTokenJWT(jwtClient, callback);
		jwtClient.setCredentials(JSON.parse(token));

		driveAPI = google.drive({
			version: 'v3',
			auth: jwtClient
		});

		retrieveAllFiles(options).then(data => parentPort.postMessage(data)).catch(console.error);
	});
} else {
	const {
		client_secret,
		client_id,
		redirect_uris
	} = credentials.installed;

	const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

	fs.readFile(TOKEN_PATH, (err, token) => {
		if (err) return getAccessToken(oAuth2Client, callback);
		oAuth2Client.setCredentials(JSON.parse(token));

		driveAPI = google.drive({
			version: 'v3',
			auth: oAuth2Client
		});

		retrieveAllFiles(options).then(data => parentPort.postMessage(data)).catch(console.error);
	});
}

options.q = `\'${folder.id}\' in parents and trashed = false and mimeType != \'application/vnd.google-apps.folder\'`;
delete options.pageToken;


function retrieveAllFiles(options, result = []) {
	return new Promise(async (resolve, reject) => {
		const resp = await driveAPI.files.list(options).catch(reject);
	
		result = result.concat(resp.data.files);
	
		if (resp.data.nextPageToken) {
			options.pageToken = resp.data.nextPageToken;
	
			const res = await retrieveAllFiles(options, result).catch(reject);
			resolve(res);
		} else {
			resolve(result);
		}
	});
}