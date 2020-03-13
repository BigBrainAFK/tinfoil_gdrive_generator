// https://docs.google.com/uc?export=download&id=

const progArgs = process.argv.slice(2);
const flags = {};
flags.auto = getArgument('auto', true, false);
flags.auth = getArgument('auth', true, false);
flags.debug = getArgument('debug', true, false);
flags.choice = getArgument('source', false);
flags.upload = getArgument('upload', false);
flags.uploadDrive = getArgument('uploadDrive', false);
flags.oldFormat = getArgument('oldFormat', true, false);
flags.makeTfl = getArgument('makeTfl', true, false);
flags.keepMissingId = getArgument('keepMissingId', true, false);

function getArgument(name, isFlag, defaultValue = null) {
	if (progArgs.includes(`-${name}`)) {
		const index = progArgs.indexOf(`-${name}`);
		if (!isFlag) {
			var argValue = progArgs[index + 1];
		}
		progArgs.splice(index, isFlag ? 1 : 2);
		return isFlag ? true : argValue;
	}
	return defaultValue;
}

const rootfolders = progArgs;

function question(question) {
	return new Promise((resolve, reject) => {
		rl.question(question, (answer) => {
			resolve(answer)
		});
	});
}

const fs = require('fs');
const readline = require('readline');
const { google } = require('googleapis');
const moment = require('moment');
const path = require('path');
const fetch = require('node-fetch');
const cliProgress = require('cli-progress');

let conf = {};

if (fs.existsSync('./conf.json')) {
	conf = require('./conf.json');
}

conf.listNSP = conf.listNSP || false;
conf.listNSZ = conf.listNSZ || false;
conf.listXCI = conf.listXCI || false;
conf.listCustomXCI = conf.listCustomXCI || false;
conf.indexFileId = conf.indexFileId || '';
conf.lastCommit = conf.lastCommit || '';
conf.motd = conf.motd || 'Loaded custom index';

const SCOPES = ['https://www.googleapis.com/auth/drive'];
const TOKEN_PATH = 'token.json';
let driveAPI;
let selectedDrive;

const outFilename = 'index.json';
const finalFilename = 'index.html';
const tflFilename = 'index.tfl';

const outputPath = path.join('output', outFilename);
const encPath = path.join('shop', finalFilename);
const tflPath = path.join('shop', tflFilename);

const progBar = new cliProgress.SingleBar({
	format: 'Adding files: [{bar}] {percentage}% | ETA: {eta}s | {value}/{total} files'
}, cliProgress.Presets.shades_classic);

const folderBar = new cliProgress.SingleBar({
	format: 'Getting folders: [{bar}] {percentage}% | ETA: {eta}s | {value}/{total} folders'
}, cliProgress.Presets.shades_classic);

const fileListJson = {
	files: [],
	success: conf.motd,
};

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});

fs.readFile('credentials.json', (err, content) => {
	if (err) return console.log('Error loading client secret file:', err);

	checkCommit().then(() => authorize(JSON.parse(content), choice));
});

const locationsConf = JSON.parse('["sdmc:/","usb:/","usbfs:/",{"url":"https://hbgshop.ga/ng","priority":20,"enabled":0},{"url":"https://thehbg.shop/","priority":20,"enabled":0},{"url":"https://thehbg.shop/lang","enabled":0}]');

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
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

		callback();
	});
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getAccessToken(oAuth2Client, callback) {
	const authUrl = oAuth2Client.generateAuthUrl({
		access_type: 'offline',
		scope: SCOPES,
	});

	console.log('Authorize this app by visiting this url:', authUrl);

	rl.question('Enter the code from that page here: ', (code) => {
		oAuth2Client.getToken(code, (err, token) => {
			if (err) return console.error('Error retrieving access token', err);
			oAuth2Client.setCredentials(token);
			fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
				if (err) return console.error(err);
				console.log('Token stored to', TOKEN_PATH);
			});

			driveAPI = google.drive({
				version: 'v3',
				auth: oAuth2Client
			});
	
			callback();
		});
	});
}

async function choice() {
	const drives = await retrieveAllDrives({
		fields: 'nextPageToken, drives(id, name)'
	}).catch(console.error);
	let x = 1;

	let chosen = flags.choice || null;
	const chosenIsNaN = isNaN(Number(chosen));

	if (chosenIsNaN && chosen !== null) {
		const foundIndex = drives.findIndex(e => e.id === chosen);

		if (foundIndex < 0) chosen = null;
		else chosen = foundIndex + 2;
	}

	chosen = Number(chosen);

	if (!chosen && !flags.auto) {
		console.log('1: Your own drive');
		for (const gdrive of drives) {
			console.log(`${++x}: ${gdrive.name} (${gdrive.id})`);
		}
	
		chosen = Number(await question('Enter your choice: ').catch(console.error));
	} else if (!chosen && flags.auto) {
		console.error('Source argument invalid. Aborting auto.');
		process.exit(1);
	} else {
		x += drives.length;
	}

	if (chosen === 1) {
		listDriveFiles();
	} else if (chosen <= x && chosen > 1) {
		selectedDrive = `${drives[chosen - 2].name} (${drives[chosen - 2].id})`;
		listDriveFiles(drives[chosen - 2].id);
	} else {
		if (flags.choice) flags.choice = null;
		choice();
	}
}1

async function listDriveFiles(driveId = null) {
	if (!conf.listNSP && !conf.listNSZ && !conf.listXCI) {
		console.log('Nothing to add to the HTML file')
		process.exit();
	}

	const startTime = moment.now();

	const folderOptions = {
		fields: 'nextPageToken, files(id, name)',
		orderBy: 'name'
	};

	if (!rootfolders.length && !flags.auto) {
		const rId = await question('Whats the root folder id: ').catch(console.error);
		rootfolders.push(rId);
	}
	if (!rootfolders.length && flags.auto) {
		debugMessage('Invalid root argument. Assuming shared drive as root.');
	}

	if (driveId) {
		folderOptions.driveId = driveId;
		folderOptions.corpora = 'drive';
		folderOptions.includeItemsFromAllDrives = true;
		folderOptions.supportsAllDrives = true;
	} else {
		folderOptions.corpora = 'user';
	}
		
	await addToFile(driveId, driveId).catch(console.error);

	if (!fs.existsSync('output/')) fs.mkdirSync('output/');
	if (!fs.existsSync('shop/')) fs.mkdirSync('shop/');

	fs.writeFileSync(outputPath, JSON.stringify(fileListJson, null, '\t'));

	await encrypt().catch(console.error);

	console.log('Generation of HTML completed.');
	console.log(`Took: ${moment.utc(moment().diff(startTime)).format('HH:mm:ss.SSS')}`);

	if (driveId) {
		let driveAnswer = flags.uploadDrive;
		
		if (!driveAnswer && !flags.auto) driveAnswer = await question(`Write to ${selectedDrive}? [y/n]:`).catch(console.error);
		if (!driveAnswer && flags.auto) {
			debugMessage('Invalid uploadDrive argument. Assuming no upload to shared drive.');
			writeToDrive();
		}
		if (['y', 'Y', 'yes', 'yeS', 'yEs', 'yES', 'Yes', 'YeS', 'YEs', 'YES'].includes(driveAnswer)) {
			writeToDrive(driveId);
		} else {
			writeToDrive();
		}
	} else {
		writeToDrive();
	}
}

async function addToFile(folderId, driveId = null) {
	return new Promise(async (resolve, reject) => {
		if (!folderId) reject('No folder id given');

		const options = {
			fields: 'nextPageToken, files(id, name, size, permissionIds)',
			orderBy: 'name',
			pageSize: 1000
		};
	
		if (driveId) {
			options.driveId = driveId;
			options.corpora = 'drive';
			options.includeItemsFromAllDrives = true;
			options.supportsAllDrives = true;
		} else {
			options.corpora = 'user';
		}
	
		files = await retrieveAll(rootfolders, options).catch(reject);
	
		if (files.length) {
			progBar.start(files.length, 0);

			for (const file of files) {
				debugMessage(`${file.name} (${file.id})`);

				const extension = path.extname(file.name);

				const enabledExtension = [];

				if (conf.listNSP) enabledExtension.push('.nsp');
				if (conf.listNSZ) enabledExtension.push('.nsz');
				if (conf.listXCI) enabledExtension.push('.xci');

				if (!enabledExtension.includes(extension)) continue;

				if (!/\[[0-9A-F]{16}\]/.test(file.name) && !flags.keepMissingId) {
					debugMessage(`Skipping ${file.name}(${file.id}) since the filename doesnt contain a title id`);
					continue;
				}

				const replace = [/_sr/g, /_SR/g, /_sc/g, /\(UNLOCKER\)/g, /_unlocker/g, /_SC/g];
				let gamename = file.name;
				
				for (subStr of replace) {
					gamename = gamename.replace(subStr, '');
				}

				const jsonFile = {
					//url: `gdrive:${file.id}#${encodeURIComponent(gamename).replace('+', '%20').replace(' ', '%20')}`,
					size: Number(file.size)
				}

				if (flags.oldFormat) {
					jsonFile.url = `https://docs.google.com/uc?export=download&id=${file.id}#${encodeURIComponent(gamename).replace('+', '%20').replace(' ', '%20')}`;
				} else {
					jsonFile.url = `gdrive:${file.id}#${gamename}`;
				}

				if (file.permissionIds.filter(val => /\D{1}/g.test(val)).length > 0 && flags.auth) {
					const permsToDelete = file.permissionIds.filter(val => val.length > 20);

					const permissionRequest = {
						fileId: file.id,
						supportsAllDrives: true
					};

					for (permId of permsToDelete) {
						if (permId === 'anyoneWithLink') continue;
						permissionRequest.permissionId = permId;

						await driveAPI.permissions.delete(permissionRequest).catch(reject);
						debugMessage(`Delete permId ${permId} from fileId ${file.id}`);
					}
				}

				if (!file.permissionIds.includes('anyoneWithLink') && flags.auth) {
					const permissionRequest = {
						fileId: file.id,
						requestBody: {
						  role: 'reader',
						  type: 'anyone',
						},
						supportsAllDrives: true
					};

					await driveAPI.permissions.create(permissionRequest).catch(reject);
					debugMessage('Created perms');
				} else if (!flags.auth) {
					debugMessage('Automatig authing disabled. Won\'t set permissions.')
				} else {
					debugMessage('Already has perms');
				}

				fileListJson.files.push(jsonFile);
				progBar.increment();
			};
		} else {
			console.log('No files found.');
		}
		progBar.stop();
		resolve();
	});
}

async function writeToDrive(driveId = null) {
	let answer = flags.upload;
	
	if (!answer && !flags.auto) answer = await question('Do you want to upload the file to your google drive? [y/n]: ').catch(console.error);
	if (!answer && flags.auto) {
		debugMessage('Invalid upload argument. Assuming to not upload the file.');
	}

	if (answer === 'y') {
		await doUpload(driveId).catch(console.error);
	}

	if (!flags.auto) {
		process.stdout.write('\nPress any key to exit...');
	
		process.stdin.setRawMode(true);
		process.stdin.resume();
		process.stdin.on('data', process.exit.bind(process, 0));
	} else {
		process.exit(0);
	}
}

async function doUpload(driveId = null) {
	return new Promise(async (resolve, reject) => {
		const media = {
			mimeType: 'application/json',
			body: fs.createReadStream(encPath),
		};

		const fileMetadata = {};
	
		const requestData = {
			media,
		};

		if (driveId) {
			requestData.driveId = driveId;
			requestData.corpora = 'drive';
			requestData.includeItemsFromAllDrives = true;
			requestData.supportsAllDrives = true;
		}

		if (conf.indexFileId) {	
			console.log(`Updating the ${finalFilename} on the drive...`);

			requestData.resource = fileMetadata;
			requestData.fileId = conf.indexFileId;
	
			await driveAPI.files.update(requestData).catch(reject);	  
		} else {
			console.log(`Creating the ${finalFilename} on the drive...`);
	
			fileMetadata.name = finalFilename;
	
			if (driveId) {
				fileMetadata.parents = [driveId];
			}
	
			requestData.resource = fileMetadata;
			requestData.fields = 'id';

			const file = await driveAPI.files.create(requestData).catch(reject);
	
			conf.indexFileId = file.data.id;

			locationsConf.push(`gdrive:${conf.indexFileId}`);
	
			fs.writeFileSync('conf.json', JSON.stringify(conf, null, '\t'));
			fs.writeFileSync('locations.conf', JSON.stringify(locationsConf));
		}
	
		console.log('Done!');
		resolve();
	});
}

function retrieveAll(folderIds, options) {
	return new Promise(async (resolve, reject) => {
		const result = [];

		for (folderId of folderIds) {
			options.q = `\'${folderId}\' in parents and trashed = false and mimeType = \'application/vnd.google-apps.folder\'`;
			result.push(...await retrieveAllFolders(options).catch(reject));

			result.push({id: folderId});
		}

		let response = [];
		
		folderBar.start(result.length, 0);

		for (const folder of result) {
			debugMessage(`Getting files from ${folder.id}`);
			options.q = `\'${folder.id}\' in parents and trashed = false and mimeType != \'application/vnd.google-apps.folder\'`;
			delete options.pageToken;
			const resp = await retrieveAllFiles(options).catch(reject);
			response = response.concat(resp);
			folderBar.increment();
		}

		folderBar.stop();

		resolve(response);
	});
}

function retrieveAllFolders(options, result = []) {
	return new Promise(async (resolve, reject) => {
		const resp = await driveAPI.files.list(options).catch(reject);
	
		result = result.concat(resp.data.files);
	
		if (resp.data.nextPageToken) {
			options.pageToken = resp.data.nextPageToken;
	
			const res = await retrieveAllFolders(options, result).catch(reject);
			resolve(res);
		} else {
			let response = [];
			for (const folder of result) {
				options.q = `\'${folder.id}\' in parents and trashed = false and mimeType = \'application/vnd.google-apps.folder\'`;
				delete options.pageToken;
				const resp = await retrieveAllFolders(options).catch(reject);
				response = response.concat(resp);
			}

			response = response.concat(result);

			resolve(response);
		}
	});
}

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


function retrieveAllDrives(options, result = []) {
	return new Promise(async (resolve, reject) => {
		const resp = await driveAPI.drives.list(options).catch(reject);
	
		result = result.concat(resp.data.drives);

		if (resp.data.nextPageToken) {
			options.pageToken = resp.data.nextPageToken;
	
			const res = await retrieveAllDrives(options, result).catch(reject);
			resolve(res);
		} else {
			resolve(result);
		}
	});
}

function encrypt() {
	return new Promise((resolve, reject) => {
		const encrypter = require('child_process').spawn('node', ['encrypt.js', outputPath, encPath]);

		encrypter.stdout.pipe(process.stdout);
		encrypter.stderr.pipe(process.stderr);

		encrypter.on('exit', () => {
			if (fs.existsSync(encPath) && flags.makeTfl)
				fs.copyFileSync(encPath, tflPath);

			resolve();
		});
	});
}

async function checkCommit() {
	return;

	if (!conf.lastCommit) {
		await getNewTitleDB().catch(console.error);
	} else {
		const currentCommit = JSON.parse(await http.get('https://api.github.com/repos/blawar/titledb/commits/master').catch(console.error)).sha;

		if (currentCommit !== conf.lastCommit) {
			await getNewTitleDB().catch(console.error);
		}
	}
}

async function getNewTitleDB() {
	const res = await fetch('https://github.com/blawar/titledb/archive/master.zip').catch(console.error);
	await new Promise((resolve, reject) => {
		const fileStream = fs.createWriteStream('./temp.0');
		res.body.pipe(fileStream);
		
		fileStream.on("finish", () => {
			const admzip = require('adm-zip');
			const zip = new admzip('./temp.0');
			zip.extractAllTo("./titledb/", true);
		
			fs.unlinkSync('./temp.0');
			
			resolve();
		});
	});
}

function debugMessage(text) {
	if (flags.debug) {
		console.log(text);
	}
}
