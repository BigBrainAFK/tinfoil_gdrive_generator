# Tinfoil index.json generator

This is a small node.js script that will allow you to easily generate an index.json for use with Tinfoil.


# Installation

## Requirements
- [Python 3.X](https://www.python.org/downloads/) (I will implement the encryption in NodeJS at some point)
- [NodeJS](https://nodejs.org/en/) (v12.X preferably even newer)
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

|Flag|Required|Argument value|
|--|--|--|
|`-auto`|❌||
|`-debug`|❌||
|`-source`|❌|Number or Google Shared Drive ID|
|`-root`|❌|Google Folder ID|
|`-upload`|❌|Either `y` or `n`|
|`-uploadDrive`|❌|Either `y` or `n`|

Now that we established the flags lets see some examples:

`node index.js -auto -source SHARED_DRIVE_ID`

This will look for folders called `NSP Dump`, `NSZ`, `XCI Trimmed`, `Custom XCI` in the provided shared drive's root directory. (You can configure what types of files it will look for using the `config.json`)

`node index.js -auto -source SHARED_DRIVE_ID -root FOLDER_ID`

This will do almost the same as not providing a folder id. The only difference being that it will look for the folders in the provided folder instead of the shared drive's root directory.

`node index.js -auto -source SHARED_DRIVE_ID -upload y`

This will upload the resulting index to your Google `mydrive` location.

`node index.js -auto -source SHARED_DRIVE_ID -uploadDrive y -upload y`

This will upload the resulting file to the source shared drive if one was provided. This cant be used without also setting upload to `y`.
