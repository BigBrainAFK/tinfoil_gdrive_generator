# Tinfoil index.json generator

This is a small node.js script that will allow you to easily generate an index.html for use with Tinfoil.  
**!!!THIS TOOL ONLY WORKS WITH A VALID SXOS LICENSE ON THE SWITCH CONSOLE!!!**

# Installation

## Requirements
- [NodeJS](https://nodejs.org/en/) (v13.7.X or newer)
- [YarnPKG](https://yarnpkg.com/lang/en/)
- A credentials file of the Google account with access to your stash (Get one [here](https://developers.google.com/drive/api/v3/quickstart/nodejs))
- A few brain cells

## How to install

1. Open a command prompt
2. Navigate to the folder containing the generator
3. Run `yarn install`

# Usage

Here I will explain how to use this tool in a bit more detail.

## Interactive

Just run `node index.js` and the rest will be gone through interactively.

## Automated

Here I will explain on how to automate this tool for usage with cron etc.

### Command-line flags

|Flag|Required|Argument value|Description
|--|--|--|--|
|`-auto`|❌||Non-interactive mode|
|`-debug`|❌||Print debug messages|
|`-source`|❌|Number or Google Shared Drive ID|Specify source Drive|
|`-upload`|❌|Either `y` or `n`|Upload file to Google Drive|
|`-uploadDrive`|❌|Either `y` or `n`|Upload to source shared drive (if specified)|
|`-oldFormat`|❌||Use `https:` url protocol instead of `gdrive:`|
|`-makeTfl`|❌||Create a `.tfl` file along the `.html` file|
|`-keepMissingId`|❌||Include files without title id in the name|

#### Auth flag note
The auth flag will set every file the script goes through to be accessible by anyone with the link.
This is only for people who dont indent to give others direct access to the stash but only via the index file.
The faster and more prefered way is to auth Tinfoil with GDrive by setting up the credentials of the right account in NUT.
Then connect your Tinfoil to nut either via USB or Network. After that you can access the index file content even without sharing each file.

#### keepMissingId flag note
Tinfoil will be dramatically slowed down by files without title ids in them.
If you still want access to those files you can use this flag to still include them.

### Examples of automation
Now that we established the flags lets see some examples:

`node index.js -auto -source SHARED_DRIVE_ID`

This will get all files in all folders in the provided shared drive's root directory and sort them by what extensions you enabled in the config. (You can configure what types of files it will look for using the `config.json`)

`node index.js -auto -source SHARED_DRIVE_ID FOLDER_ID`

This will do almost the same as not providing a folder id. The only difference being that it will look for the folders in the provided folder instead of the shared drive's root directory.

`node index.js -auto -source SHARED_DRIVE_ID -upload y`

This will upload the resulting index to your Google `mydrive` location.

`node index.js -auto -source SHARED_DRIVE_ID -uploadDrive y -upload y`

This will upload the resulting file to the source shared drive if one was provided. This cant be used without also setting upload to `y`.
