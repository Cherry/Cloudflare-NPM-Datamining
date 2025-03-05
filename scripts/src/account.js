import 'dotenv/config';
import path from 'node:path';
import process from 'node:process';

import dateFormat from 'dateformat';
import fs from 'fs-extra';
import fetch from 'node-fetch';

import { tryAndPush } from './utils.js';

const BASE = 'https://api.cloudflare.com/client/v4';

async function callApi(path) {
	try {
		const res = await fetch(`${BASE}${path}`, {
			headers: {
				'X-Auth-Email': process.env.CLOUDFLARE_EMAIL,
				'X-Auth-Key': process.env.CLOUDFLARE_GLOBAL_KEY,
			},
		});

		if (res.status === 200) {
			const json = await res.json();
			if (json.success) {
				return json.result;
			} else {
				console.error(`API call failed: ${JSON.stringify(json)}`);
			}
		} else {
			console.error(`Failed to fetch: ${res.status} ${res.statusText}`);
		}
	} catch (error) {
		console.error(`Error calling API: ${error.message}`);
	}
	return null;
}

async function fetchAndWrite(apiPath, filePath, sortFunc = null) {
	try {
		const json = await callApi(apiPath);

		if (json !== null) {
			await fs.ensureDir(path.dirname(filePath));
			let data = json;
			if (sortFunc !== null) {
				data = json.sort(sortFunc);
			}
			await fs.writeFile(path.resolve(filePath), JSON.stringify(data, null, '\t'));
			console.log(`Successfully wrote to ${filePath}`);
		} else {
			console.warn(`No data fetched for ${apiPath}`);
		}
	} catch (error) {
		console.error(`Error fetching and writing data from ${apiPath}: ${error.message}`);
	}
}

async function gitPush() {
	try {
		const date = new Date();
		const commitMessage = dateFormat(date, 'd mmmm yyyy') + ' - Updated account (flags, entitlements, etc.)';

		await tryAndPush(
			['data/account/*.json'],
			commitMessage,
			'CFData - Account (Flags, Entitlements, etc.) Update',
			'Pushed account (Flags, Entitlements, etc.) update: ' + commitMessage,
			'DISCORD_WEBHOOK_ACCOUNT',
		);
		console.log('Git push successful');
	} catch (error) {
		console.error(`Error during git push: ${error.message}`);
	}
}

async function run() {
	try {
		console.log('Fetching...');
		// Flags
		await fetchAndWrite(`/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/flags`, '../data/account/account_flags.json');
		await fetchAndWrite(`/zones/${process.env.CLOUDFLARE_ZONE_ID}/flags`, '../data/account/zone_flags.json');

		// Entitlements
		await fetchAndWrite(`/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/entitlements`, '../data/account/account_entitlements.json');
		await fetchAndWrite(`/zones/${process.env.CLOUDFLARE_ZONE_ID}/entitlements`, '../data/account/zone_entitlements.json');

		// Roles
		await fetchAndWrite(`/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/roles?per_page=100`, '../data/account/account_roles.json');

		// API tokens permission groups
		await fetchAndWrite('/user/tokens/permission_groups', '../data/account/token_permission_groups.json', (itemA, itemB) => (itemA.name + itemA.id).localeCompare(itemB.name + itemB.id));

		// Transforms
		await fetchAndWrite(`/zones/${process.env.CLOUDFLARE_ZONE_ID}/managed_headers`, '../data/zone_managed_headers.json');

		console.log('Pushing!');
		await gitPush();

		console.log('Done! :)');
	} catch (error) {
		console.error(`Error during run: ${error.message}`);
	}
}

run();
