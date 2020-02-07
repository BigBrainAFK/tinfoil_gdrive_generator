// https://docs.google.com/uc?export=download&id=

const progArgs = process.argv.slice(2);
const flags = {};
flags.auto = getArgument('auto', true, false);
flags.auth = getArgument('auth', true, false);
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

conf.listNSP = conf.listNSP || false;
conf.listNSZ = conf.listNSZ || false;
conf.listXCI = conf.listXCI || false;
conf.listCustomXCI = conf.listCustomXCI || false;
conf.indexFileId = conf.indexFileId || '';

const SCOPES = ['https://www.googleapis.com/auth/drive'];
const TOKEN_PATH = 'token.json';
let driveAPI;
let selectedDrive;

const outFilename = 'index.json';

const outputPath = path.join('output', outFilename);
const encPath = path.join('shop', outFilename);

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
	const chosenIsNaN = isNaN(Number(chosen));

	if (chosenIsNaN && chosen !== null) {
		const foundIndex = result.findIndex(e => e.id === chosen);

		if (foundIndex < 0) chosen = null;
		else chosen = foundIndex + 2;
	}

	chosen = Number(chosen);

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
}1

async function listDriveFiles(driveId = null) {
	if (!conf.listNSP && !conf.listNSZ && !conf.listXCI && !conf.listCustomXCI) {
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

	if (res_folders.length < 1) throw new Error('No folders found in the specified drive/rootfolder');

	const order = ['base', 'dlc', 'updates', 'XCI Trimmed', 'Custom XCI', 'Custom XCI JP', 'Special Collection'];
	const order_nsz = ['base', 'dlc', 'updates'];
		
	let folders = [];
	let folders_nsz = [];

	if (conf.listNSP) {
		const nspFolder = res_folders[res_folders.map(e => e.name).indexOf('NSP Dumps')];

		if (nspFolder) {
			folderOptions.q = `mimeType = \'application/vnd.google-apps.folder\' and trashed = false and \'${nspFolder.id}\' in parents`;

			const temp = await retrieveAllFiles(folderOptions).catch(console.error);
		
			const res_nsp = res_folders.concat(temp).filter(folder => order.includes(folder.name));
		
			for (const folder of res_nsp) {
				folders[order.indexOf(folder.name)] = folder
			};

			folders = folders.filter(arr => !!arr);
		
			await goThroughFolders(driveId, folders, ['base', 'dlc', 'updates']);
		} else {
			console.error('No NSP folder found');
		}
	} else {
		for (const folder of res_folders.filter(folder => order.includes(folder.name))) {
			folders[order.indexOf(folder.name)] = folder
		};

		folders = folders.filter(arr => !!arr);
	}

	if (conf.listNSZ) {
		const nszFolder = res_folders[res_folders.map(e => e.name).indexOf('NSZ')];

		if (nszFolder) {
			folderOptions.q = `mimeType = \'application/vnd.google-apps.folder\' and trashed = false and \'${nszFolder.id}\' in parents`;
		
			const res_nsz = (await retrieveAllFiles(folderOptions).catch(console.error)).filter(folder => order_nsz.includes(folder.name));
		
			for (const folder of res_nsz) {
				folders_nsz[order_nsz.indexOf(folder.name)] = folder
			};
	
			folders_nsz = folders_nsz.filter(arr => arr !== null);
	
			await goThroughFolders(driveId, folders_nsz, ['base', 'dlc', 'updates']);
		} else {
			console.error('No NSZ Folder found');
		}
	}

	if (conf.listXCI) {
		await goThroughFolders(driveId, folders, ['XCI Trimmed']);
	}

	if (conf.listCustomXCI) {
		const customXCIFolder = folders[folders.map(e => e.name).indexOf('Custom XCI')];

		if (customXCIFolder) {
			folderOptions.q = `mimeType = \'application/vnd.google-apps.folder\' and trashed = false and \'${customXCIFolder.id}\' in parents`;

			const temp = await retrieveAllFiles(folderOptions).catch(console.error);
		
			const res_xci = folders.concat(temp).filter(folder => order.includes(folder.name));
		
			for (const folder of res_xci) {
				folders[order.indexOf(folder.name)] = folder
			};

			folders = folders.filter(arr => !!arr);
		
			await goThroughFolders(driveId, folders, ['Custom XCI', 'Custom XCI JP', 'Special Collection']);
		} else {
			console.error('No Custom XCI folder found');
		}
	}

	if (!fs.existsSync('output/')) fs.mkdirSync('output/');
	if (!fs.existsSync('shop/')) fs.mkdirSync('shop/');

	fs.writeFileSync(outputPath, JSON.stringify(fileListJson, null, '\t'));

	await encrypt();

	console.log('Generation of JSON completed.');
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
					url: `gdrive:/${file.id}#${encodeURIComponent(gamename).replace('+', '%20').replace(' ', '%20')}`,
					size: Number(file.size)
				}

				if (!file.permissionIds.includes('anyoneWithLink') && flags.auth) {
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
				} else if (!flags.auth) {
					debugMessage('Automatig authing disabled. Won\'t set permissions.')
				} else {
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
			console.log(`Updating the ${outFilename} on the drive...`);

			requestData.resource = fileMetadata;
			requestData.fileId = conf.indexFileId;
	
			await driveAPI.files.update(requestData).catch(console.error);	  
		} else {
			console.log(`Creating the ${outFilename} on the drive...`);
	
			fileMetadata.name = outFilename;
	
			if (driveId) {
				if (flags.root) {
					fileMetadata.parents = [flags.root];
				} else {
					fileMetadata.parents = [driveId];
				}
			}
	
			requestData.resource = fileMetadata;
			requestData.fields = 'id';

			const file = await driveAPI.files.create(requestData).catch(console.error);
	
			conf.indexFileId = file.data.id;
	
			fs.writeFileSync('conf.json', JSON.stringify(conf, null, '\t'));
		}
	
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

function encrypt() {
	return new Promise((resolve, reject) => {
		console.log(outputPath);
		console.log(encPath);
		const python = require('child_process').spawn('python3', ['encrypt.py', outputPath, encPath]);

		python.stdout.pipe(process.stdout);
		python.stderr.pipe(process.stderr);

		python.on('exit', () => {
			resolve();
		});
	});
}

function debugMessage(text) {
	if (flags.debug) {
		console.log(text);
	}
}
