// https://docs.google.com/uc?export=download&id=

const progArgs = process.argv.slice(2);
const flags = {};
flags.auto = getArgument('auto', true, false);
flags.debug = getArgument('debug', true, false);
flags.choice = getArgument('source', false);
flags.root = getArgument('root', false);
flags.upload = getArgument('upload', false);
flags.uploadDrive = getArgument('uploadDrive', false);

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
const stream = require('stream');
const path = require('path');

let conf = {};

if (fs.existsSync('./conf.json')) {
	conf = require('./conf.json');
}

const listNSP = conf.listNSP || null;
const listNSZ = conf.listNSZ || null;
const listOthers = conf.listOthers || null;

const SCOPES = ['https://www.googleapis.com/auth/drive'];
const TOKEN_PATH = 'token.json';
let driveAPI;
let selectedDrive;

const fileListJson = {
	files: [],
	success: 'Loaded custom index',
};

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});

fs.readFile('credentials.json', (err, content) => {
	if (err) return console.log('Error loading client secret file:', err);

	authorize(JSON.parse(content), choice);
});

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
	const resp = await driveAPI.drives.list({
		fields: 'drives(id, name)'
	}).catch(console.error);

	const result = resp.data.drives;
	let x = 1;

	let chosen = flags.choice || null;

	if (!Number(chosen) && chosen !== null) chosen = result.findIndex(e => e.id === chosen) + 2;

	if (!chosen && !flags.auto) {
		console.log('1: Your own drive');
		for (const gdrive of result) {
			console.log(`${++x}: ${gdrive.name} (${gdrive.id})`);
		}
	
		chosen = Number(await question('Enter your choice: '));
	} else if (!chosen && flags.auto) {
		console.error('Source argument invalid. Aborting auto.');
		process.exit(1);
	} else {
		x += result.length;
	}

	if (chosen === 1) {
		listDriveFiles();
	} else if (chosen <= x && chosen > 1) {
		selectedDrive = `${result[chosen - 2].name} (${result[chosen - 2].id})`;
		listDriveFiles(result[chosen - 2].id);
	} else {
		if (flags.choice) flags.choice = null;
		choice();
	}
}

async function listDriveFiles(driveId = null) {
	if (!listNSP && !listNSZ && !listOthers) {
		console.log('Nothing to add to the HTML file')
		process.exit();
	}

	const startTime = moment.now();

	const folderOptions = {
		fields: 'nextPageToken, files(id, name)',
		orderBy: 'name'
	};

	let rootfolder = flags.root;

	if (!rootfolder && !flags.auto) rootfolder = await question('Whats the root folder id: ');
	if (!rootfolder && flags.auto) {
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

	folderOptions.q = `mimeType = \'application/vnd.google-apps.folder\' and trashed = false`;

	folderOptions.q += ` and \'${rootfolder ? rootfolder : driveId}\' in parents`;

	let res_folders = await retrieveAllFiles(folderOptions).catch(console.error);

	const order = ['base', 'dlc', 'updates', 'Custom XCI', 'Custom XCI JP', 'Special Collection', 'XCI Trimmed'];
	const order_nsz = ['base', 'dlc', 'updates'];
		
	let folders = [];
	let folders_nsz = [];

	if (listNSP) {
		folderOptions.q = `mimeType = \'application/vnd.google-apps.folder\' and trashed = false and \'${res_folders[res_folders.map(e => e.name).indexOf('NSP Dumps')].id}\' in parents`;

		const temp = await retrieveAllFiles(folderOptions).catch(console.error);
	
		const res_nsp = res_folders.concat(temp).filter(folder => order.includes(folder.name));
	
		for (const folder of res_nsp) {
			folders[order.indexOf(folder.name)] = folder
		};

		folders = folders.filter(arr => !!arr);
	
		await goThroughFolders(driveId, folders, ['base', 'dlc', 'updates']);
	} else {
		for (const folder of res_folders.filter(folder => order.includes(folder.name))) {
			folders[order.indexOf(folder.name)] = folder
		};

		folders = folders.filter(arr => !!arr);
	}

	if (listNSZ) {
		folderOptions.q = `mimeType = \'application/vnd.google-apps.folder\' and trashed = false and \'${res_folders[res_folders.map(e => e.name).indexOf('NSZ')].id}\' in parents`;
	
		const res_nsz = (await retrieveAllFiles(folderOptions).catch(console.error)).filter(folder => order_nsz.includes(folder.name));
	
		for (const folder of res_nsz) {
			folders_nsz[order_nsz.indexOf(folder.name)] = folder
		};

		folders_nsz = folders_nsz.filter(arr => arr !== null);

		await goThroughFolders(driveId, folders_nsz, ['base', 'dlc', 'updates']);
	}

	if (listOthers) {
		await goThroughFolders(driveId, folders, ['Custom XCI', 'Custom XCI JP', 'XCI Trimmed', 'Special Collection']);
	}

	if (!fs.existsSync('output/')) fs.mkdirSync('output/');
	if (!fs.existsSync('shop/')) fs.mkdirSync('shop/');

	fs.writeFileSync('output/index.json', JSON.stringify(fileListJson, null, '\t'));

	const python = require('child_process').spawn('python3', ['encrypt.py', 'output/index.json', 'shop/index.json']);

	console.log('Generation of HTML completed.');
	console.log(`Took: ${moment.utc(moment().diff(startTime)).format('HH:mm:ss.SSS')}`);

	if (driveId) {
		let driveAnswer = flags.uploadDrive;
		
		if (!driveAnswer && !flags.auto) driveAnswer = await question(`Write to ${selectedDrive}? [y/n]:`);
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

function goThroughFolders(driveId, folders, includeIndex) {
	return new Promise(async (resolve, reject) => {
		if (!folders) reject('Missing parameter folder');

		for (const folder of folders) {
			if (!includeIndex.includes(folder.name)) continue;
	
			debugMessage(folder.name);

			await addToFile(folder, driveId);
		}
		resolve();
	});
}

async function addToFile(folder, driveId = null) {
	return new Promise(async (resolve, reject) => {
		if (!folder) reject('No folder given');

		const options = {
			fields: 'nextPageToken, files(id, name, size, permissionIds)',
			orderBy: 'name',
			pageSize: 1000,
			q: `\'${folder.id}\' in parents and trashed = false and not mimeType = \'application/vnd.google-apps.folder\'`
		};
	
		if (driveId) {
			options.driveId = driveId;
			options.corpora = 'drive';
			options.includeItemsFromAllDrives = true;
			options.supportsAllDrives = true;
		} else {
			options.corpora = 'user';
		}
	
		files = await retrieveAllFiles(options).catch(console.error);
	
		if (files.length) {
			debugMessage(`Files in ${folder.name}:`);

			for (const file of files) {
				debugMessage(`${file.name} (${file.id})`);

				const extension = path.extname(file.name);
				if (!['.nsp', '.nsz', '.xci'].includes(extension)) continue;
				
				const replace = [/_sr/g, /_SR/g, /_sc/g, /\(UNLOCKER\)/g, /_unlocker/g, /_SC/g];
				let gamename = file.name;
				
				for (subStr of replace) {
					gamename = gamename.replace(subStr, '');
				}

				const jsonFile = {
					url: `https://docs.google.com/uc?export=download&id=${file.id}#${encodeURIComponent(gamename).replace('+', '%20').replace(' ', '%20')}`,
					size: Number(file.size)
				}

				if (!file.permissionIds.includes('anyoneWithLink')) {
					const permissionRequest = {
						fileId: file.id,
						requestBody: {
						  role: 'reader',
						  type: 'anyone',
						}
					};
		
					if (driveId) {
						permissionRequest.driveId = driveId;
						permissionRequest.corpora = 'drive';
						permissionRequest.includeItemsFromAllDrives = true;
						permissionRequest.supportsAllDrives = true;
					} else {
						permissionRequest.corpora = 'user';
					}

					await driveAPI.permissions.create(permissionRequest).catch(console.error);
					debugMessage('Created perms');
				}
			 else {
				 debugMessage('Already has perms');
			 }

				fileListJson.files.push(jsonFile);
			};
		} else {
			console.log('No files found.');
		}
		resolve();
	});
}

async function writeToDrive(driveId = null) {
	let answer = flags.upload;
	
	if (!answer && !flags.auto) answer = await question('Do you want to upload the HTML to your google drive? [y/n]: ');
	if (!answer && flags.auto) {
		debugMessage('Invalid upload argument. Assuming to not upload the file.')
	}

	if (answer === 'y') {
		await doUpload(driveId)
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
		const buf = Buffer.from(fs.readFileSync('shop/index.json'), 'binary');
		const buffer = Uint8Array.from(buf);
		var bufferStream = new stream.PassThrough();
		bufferStream.end(buffer);
		const media = {
			body: bufferStream,
		};
	
		console.log('Creating the files.html on the drive...')
	
		const fileMetadata = {
			name: 'index.json'
		};
	
		if (driveId) {
			fileMetadata.parents = [driveId];
		}
	
		await driveAPI.files.create({
			resource: fileMetadata,
			media,
			fields: 'id'
		}).catch(console.error);
	
		console.log('Done!');
		resolve();
	});
}

function retrieveAllFiles(options) {
	return new Promise(async (resolve, reject) => {
		const result = await retrievePageOfFiles(options, []).catch(console.error);
	
		resolve(result);
	});
}

function retrievePageOfFiles(options, result) {
	return new Promise(async (resolve, reject) => {
		const resp = await driveAPI.files.list(options).catch(console.error);
	
		result = result.concat(resp.data.files);
	
		if (resp.data.nextPageToken) {
			options.pageToken = resp.data.nextPageToken;
	
			const res = await retrievePageOfFiles(options, result).catch(console.error);
			resolve(res);
		} else {
			resolve(result);
		}
	});
}

function debugMessage(text) {
	if (flags.debug) {
		console.log(text);
	}
}
