import { Readable } from 'stream';
import test from 'ava';
import superagent from 'superagent';
import superagentMock from 'superagent-mock';

import deploy from '../index.js';

const wrapData = (match, data) => ({ body: data });

class ResponseError extends Error {
	constructor(body, status) {
		super('Request failed.');
		this.response = { body, status };
	}
}

class EmptyStream extends Readable {
	_read() {
		this.push(null);
	}
}

test.beforeEach(t => {
	t.context.requests = [];
	t.context.mock = superagentMock(superagent, [{
		pattern: '^https://login.microsoftonline.com/([^/]+)/oauth2/token$',
		fixtures(match, params, headers) {
			t.context.requests.push({ match: match.slice(1), params, headers });
			const resp = t.context.responses.shift();
			if (resp instanceof Error) throw resp;
			else return resp;
		},
		post: wrapData,
	}, {
		pattern: '^https://manage.devcenter.microsoft.com/v1.0/my/applications/([^/]+)(?:/flights/([^/]+))?(.*)$',
		fixtures(match, params, headers) {
			t.context.requests.push({ match: match.slice(1), params, headers });
			const resp = t.context.responses.shift();
			if (resp instanceof Error) throw resp;
			else return resp;
		},
		get: wrapData,
		post: wrapData,
		put: wrapData,
		delete: wrapData,
	}, {
		pattern: '^https://mockfileupload.url$',
		fixtures(match, params, headers) {
			t.context.requests.push({ match: match.slice(), params, headers });
			const resp = t.context.responses.shift();
			if (resp instanceof Error) throw resp;
			else return resp;
		},
		put: wrapData,
	}, {
		pattern: '.*',
		fixtures(match) {
			throw new Error('No mocked endpoint for: ' + match);
		}
	}]);

	const oldSetTimeout = global.setTimeout;
	t.context.oldSetTimeout = oldSetTimeout;
	global.setTimeout = function shortSetTimeout(fn, delay, ...args) {
		return oldSetTimeout(fn, delay / 1000, ...args);
	};
});

test.afterEach(t => {
	t.context.mock.unset();

	global.setTimeout = t.context.oldSetTimeout;
});

test.serial('missing fields', async t => {
	await t.throws(
		deploy({ clientId: 'q', clientSecret: 'q', appId: 'q', appx: new EmptyStream() }),
		'Missing required field: tenantId'
	);

	await t.throws(
		deploy({ tenantId: 'q', clientSecret: 'q', appId: 'q', appx: new EmptyStream() }),
		'Missing required field: clientId'
	);

	await t.throws(
		deploy({ tenantId: 'q', clientId: 'q', appId: 'q', appx: new EmptyStream() }),
		'Missing required field: clientSecret'
	);

	await t.throws(
		deploy({ tenantId: 'q', clientId: 'q', clientSecret: 'q', appx: new EmptyStream() }),
		'Missing required field: appId'
	);

	await t.throws(
		deploy({ tenantId: 'q', clientId: 'q', clientSecret: 'q', appId: 'q', }),
		'Missing required field: appx'
	);
});

test.serial('failing access token', async t => {
	t.context.responses = [new ResponseError({ error: 'failed' })];

	await t.throws(
		deploy({ tenantId: 'q', clientId: 'q', clientSecret: 'q', appId: 'q', appx: new EmptyStream() }),
		'Failed to fetch access token: failed'
	);

	t.is(t.context.requests.length, 1);
});

test.serial('failing access token, status', async t => {
	t.context.responses = [new ResponseError({}, 403)];

	await t.throws(
		deploy({ tenantId: 'q', clientId: 'q', clientSecret: 'q', appId: 'q', appx: new EmptyStream() }),
		'Failed to fetch access token: 403'
	);

	t.is(t.context.requests.length, 1);
});

test.serial('no access token', async t => {
	t.context.responses = [{}];

	await t.throws(
		deploy({ tenantId: 'q', clientId: 'q', clientSecret: 'q', appId: 'q', appx: new EmptyStream() }),
		'No access token received.'
	);

	t.is(t.context.requests.length, 1);
});

test.serial('failing app info', async t => {
	t.context.responses = [
		{ access_token: 'q' },
		new ResponseError({ code: 'errorCode' }),
	];

	await t.throws(
		deploy({ tenantId: 'q', clientId: 'q', clientSecret: 'q', appId: 'q', appx: new EmptyStream() }),
		'Failed to fetch app: errorCode',
	);

	t.is(t.context.requests.length, 2);
});

test.serial('failing flight info', async t => {
	t.context.responses = [
		{ access_token: 'q' },
		new ResponseError({ code: 'errorCode' }),
	];

	await t.throws(
		deploy({ tenantId: 'q', clientId: 'q', clientSecret: 'q', appId: 'q', flightId: 'q', appx: new EmptyStream() }),
		'Failed to fetch flight: errorCode',
	);

	t.is(t.context.requests.length, 2);
});

test.serial('failing deletion, app', async t => {
	t.context.responses = [
		{ access_token: 'q' },
		{ pendingApplicationSubmission: { id: 'submissionCode' } },
		new ResponseError({ code: 'errorCode' }),
	];

	await t.throws(
		deploy({ tenantId: 'q', clientId: 'q', clientSecret: 'q', appId: 'q', appx: new EmptyStream() }),
		'Failed to delete previous submission: errorCode',
	);

	t.is(t.context.requests.length, 3);
});

test.serial('failing deletion, flight', async t => {
	t.context.responses = [
		{ access_token: 'q' },
		{ pendingFlightSubmission: { id: 'submissionCode' } },
		new ResponseError({ code: 'errorCode' }),
	];

	await t.throws(
		deploy({ tenantId: 'q', clientId: 'q', clientSecret: 'q', appId: 'q', flightId: 'q', appx: new EmptyStream() }),
		'Failed to delete previous submission: errorCode',
	);

	t.is(t.context.requests.length, 3);
});

test.serial('failing creation', async t => {
	t.context.responses = [
		{ access_token: 'q' },
		{},
		new ResponseError({ code: 'errorCode' }),
	];

	await t.throws(
		deploy({ tenantId: 'q', clientId: 'q', clientSecret: 'q', appId: 'q', appx: new EmptyStream() }),
		'Failed to create new submission: errorCode',
	);

	t.is(t.context.requests.length, 3);
});

test.serial('failing update', async t => {
	t.context.responses = [
		{ access_token: 'q' },
		{},
		{ fileUploadUrl: 'https://mockfileupload.url', applicationPackages: [] },
		new ResponseError({ code: 'errorCode' }),
	];

	await t.throws(
		deploy({ tenantId: 'q', clientId: 'q', clientSecret: 'q', appId: 'q', appx: new EmptyStream() }),
		'Failed to update submission: errorCode',
	);

	t.is(t.context.requests.length, 4);
});

test.serial('failing upload', async t => {
	t.context.responses = [
		{ access_token: 'q' },
		{},
		{ fileUploadUrl: 'https://mockfileupload.url', applicationPackages: [] },
		{ fileUploadUrl: 'https://mockfileupload.url', applicationPackages: [] },
		new ResponseError({ code: 'errorCode' }),
	];

	await t.throws(
		deploy({ tenantId: 'q', clientId: 'q', clientSecret: 'q', appId: 'q', appx: new EmptyStream() }),
		'Failed to upload package: errorCode',
	);

	t.is(t.context.requests.length, 5);
});

test.serial('failing commit', async t => {
	t.context.responses = [
		{ access_token: 'q' },
		{},
		{ fileUploadUrl: 'https://mockfileupload.url', applicationPackages: [] },
		{ fileUploadUrl: 'https://mockfileupload.url', applicationPackages: [] },
		{},
		new ResponseError({ code: 'errorCode' }),
	];

	await t.throws(
		deploy({ tenantId: 'q', clientId: 'q', clientSecret: 'q', appId: 'q', appx: new EmptyStream() }),
		'Failed to commit submission: errorCode',
	);

	t.is(t.context.requests.length, 6);
});

test.serial('failing completion', async t => {
	t.context.responses = [
		{ access_token: 'q' },
		{},
		{ fileUploadUrl: 'https://mockfileupload.url', applicationPackages: [] },
		{ fileUploadUrl: 'https://mockfileupload.url', applicationPackages: [] },
		{},
		{},
		new ResponseError({ code: 'errorCode' }),
	];

	await t.throws(
		deploy({ tenantId: 'q', clientId: 'q', clientSecret: 'q', appId: 'q', appx: new EmptyStream() }),
		'Failed to poll for commit status: errorCode',
	);

	t.is(t.context.requests.length, 7);
});

test.serial('bad commit status', async t => {
	t.context.responses = [
		{ access_token: 'q' },
		{},
		{ fileUploadUrl: 'https://mockfileupload.url', applicationPackages: [] },
		{ fileUploadUrl: 'https://mockfileupload.url', applicationPackages: [] },
		{},
		{},
		{ status: 'CommitFailed', statusDetails: 'statusDetails' }
	];

	await t.throws(
		deploy({ tenantId: 'q', clientId: 'q', clientSecret: 'q', appId: 'q', appx: new EmptyStream() }),
		'Failed: CommitFailed "statusDetails"',
	);

	t.is(t.context.requests.length, 7);
});

test.serial('bad commit status after polling', async t => {
	t.context.responses = [
		{ access_token: 'q' },
		{},
		{ fileUploadUrl: 'https://mockfileupload.url', applicationPackages: [] },
		{ fileUploadUrl: 'https://mockfileupload.url', applicationPackages: [] },
		{},
		{},
		{ status: 'CommitStarted' },
		{ status: 'CommitFailed', statusDetails: 'statusDetails' }
	];

	await t.throws(
		deploy({ tenantId: 'q', clientId: 'q', clientSecret: 'q', appId: 'q', appx: new EmptyStream() }),
		'Failed: CommitFailed "statusDetails"',
	);

	t.is(t.context.requests.length, 8);
});

test.serial('bad commit status after polling 2', async t => {
	t.context.responses = [
		{ access_token: 'q' },
		{},
		{ fileUploadUrl: 'https://mockfileupload.url', applicationPackages: [] },
		{ fileUploadUrl: 'https://mockfileupload.url', applicationPackages: [] },
		{},
		{},
		{ status: 'PendingCommit' },
		{ status: 'CommitFailed', statusDetails: 'statusDetails' }
	];

	await t.throws(
		deploy({ tenantId: 'q', clientId: 'q', clientSecret: 'q', appId: 'q', appx: new EmptyStream() }),
		'Failed: CommitFailed "statusDetails"',
	);

	t.is(t.context.requests.length, 8);
});

test.serial('bad commit status after multiple polling', async t => {
	t.context.responses = [
		{ access_token: 'q' },
		{},
		{ fileUploadUrl: 'https://mockfileupload.url', applicationPackages: [] },
		{ fileUploadUrl: 'https://mockfileupload.url', applicationPackages: [] },
		{},
		{},
		{ status: 'PendingCommit' },
		{ status: 'CommitStarted' },
		{ status: 'CommitFailed', statusDetails: 'statusDetails' }
	];

	await t.throws(
		deploy({ tenantId: 'q', clientId: 'q', clientSecret: 'q', appId: 'q', appx: new EmptyStream() }),
		'Failed: CommitFailed "statusDetails"',
	);

	t.is(t.context.requests.length, 9);
});

test.serial('full publish, no pending submission', async t => {
	t.context.responses = [
		{ access_token: 'myAccessToken' },
		{},
		{ fileUploadUrl: 'https://mockfileupload.url', id: 'mySubmissionId', applicationPackages: [{ fileName: 'foo', fileStatus: 'Uploaded' }] },
		{ fileUploadUrl: 'https://mockfileupload.url', id: 'thisIdWontActuallyChangeInPractice', applicationPackages: [{ fileName: 'foo', fileStatus: 'Uploaded' }] },
		{},
		{},
		{ status: 'PreProcessing' }
	];

	await deploy({ tenantId: 'myTenantId', clientId: 'myClientId', clientSecret: 'myClientSecret', appId: 'myAppId', appx: new EmptyStream() });

	const r = t.context.requests;

	t.deepEqual(r[0].match, ['myTenantId']);

	t.deepEqual(r[1].match, ['myAppId', undefined, '']);
	t.is(r[1].headers.Authorization, 'Bearer myAccessToken');

	t.deepEqual(r[2].match, ['myAppId', undefined, '/submissions']);
	t.is(r[2].headers.Authorization, 'Bearer myAccessToken');

	t.deepEqual(r[3].match, ['myAppId', undefined, '/submissions/mySubmissionId']);
	t.is(r[3].headers.Authorization, 'Bearer myAccessToken');
	t.deepEqual(r[3].params, {
		applicationPackages: [
			{ fileName: 'package.appx', fileStatus: 'PendingUpload', minimumDirectXVersion: 'None', minimumSystemRam: 'None' },
			{ fileName: 'foo', fileStatus: 'PendingDelete' }
		],
		fileUploadUrl: 'https://mockfileupload.url',
		id: 'mySubmissionId'
	});

	t.deepEqual(r[4].match, ['https://mockfileupload.url']);
	t.is(r[4].headers.Authorization, undefined, 'no auth header for file upload');
	t.is(r[4].headers['x-ms-blob-type'], 'BlockBlob');
	t.true(r[4].params instanceof Buffer);

	t.deepEqual(r[5].match, ['myAppId', undefined, '/submissions/thisIdWontActuallyChangeInPractice/commit']);
	t.is(r[5].headers.Authorization, 'Bearer myAccessToken');

	t.deepEqual(r[6].match, ['myAppId', undefined, '/submissions/thisIdWontActuallyChangeInPractice/status']);
	t.is(r[6].headers.Authorization, 'Bearer myAccessToken');

	t.is(t.context.requests.length, 7);
});

test.serial('full publish, with pending submission', async t => {
	t.context.responses = [
		{ access_token: 'myAccessToken' },
		{ pendingApplicationSubmission: { id: 'mySubmissionCode' } },
		{},
		{ fileUploadUrl: 'https://mockfileupload.url', id: 'mySubmissionId', applicationPackages: [{ fileName: 'foo', fileStatus: 'Uploaded' }] },
		{ fileUploadUrl: 'https://mockfileupload.url', id: 'thisIdWontActuallyChangeInPractice', applicationPackages: [{ fileName: 'foo', fileStatus: 'Uploaded' }] },
		{},
		{},
		{ status: 'PreProcessing' }
	];

	await deploy({ tenantId: 'myTenantId', clientId: 'myClientId', clientSecret: 'myClientSecret', appId: 'myAppId', appx: new EmptyStream() });

	const r = t.context.requests;

	t.deepEqual(r[0].match, ['myTenantId']);

	t.deepEqual(r[1].match, ['myAppId', undefined, '']);
	t.is(r[1].headers.Authorization, 'Bearer myAccessToken');

	t.deepEqual(r[2].match, ['myAppId', undefined, '/submissions/mySubmissionCode']);
	t.is(r[2].headers.Authorization, 'Bearer myAccessToken');

	t.deepEqual(r[3].match, ['myAppId', undefined, '/submissions']);
	t.is(r[3].headers.Authorization, 'Bearer myAccessToken');

	t.deepEqual(r[4].match, ['myAppId', undefined, '/submissions/mySubmissionId']);
	t.is(r[4].headers.Authorization, 'Bearer myAccessToken');
	t.deepEqual(r[4].params, {
		applicationPackages: [
			{ fileName: 'package.appx', fileStatus: 'PendingUpload', minimumDirectXVersion: 'None', minimumSystemRam: 'None' },
			{ fileName: 'foo', fileStatus: 'PendingDelete' }
		],
		fileUploadUrl: 'https://mockfileupload.url',
		id: 'mySubmissionId'
	});

	t.deepEqual(r[5].match, ['https://mockfileupload.url']);
	t.is(r[5].headers.Authorization, undefined, 'no auth header for file upload');
	t.is(r[5].headers['x-ms-blob-type'], 'BlockBlob');
	t.true(r[5].params instanceof Buffer);

	t.deepEqual(r[6].match, ['myAppId', undefined, '/submissions/thisIdWontActuallyChangeInPractice/commit']);
	t.is(r[6].headers.Authorization, 'Bearer myAccessToken');

	t.deepEqual(r[7].match, ['myAppId', undefined, '/submissions/thisIdWontActuallyChangeInPractice/status']);
	t.is(r[7].headers.Authorization, 'Bearer myAccessToken');

	t.is(t.context.requests.length, 8);
});

test.serial('full publish to flight, no pending submission', async t => {
	t.context.responses = [
		{ access_token: 'myAccessToken' },
		{},
		{ fileUploadUrl: 'https://mockfileupload.url', id: 'mySubmissionId', flightPackages: [{ fileName: 'foo', fileStatus: 'Uploaded' }] },
		{ fileUploadUrl: 'https://mockfileupload.url', id: 'thisIdWontActuallyChangeInPractice', flightPackages: [{ fileName: 'foo', fileStatus: 'Uploaded' }] },
		{},
		{},
		{ status: 'PreProcessing' }
	];

	await deploy({ tenantId: 'myTenantId', clientId: 'myClientId', clientSecret: 'myClientSecret', appId: 'myAppId', flightId: 'myFlightId', appx: new EmptyStream() });

	const r = t.context.requests;

	t.deepEqual(r[0].match, ['myTenantId']);

	t.deepEqual(r[1].match, ['myAppId', 'myFlightId', '']);
	t.is(r[1].headers.Authorization, 'Bearer myAccessToken');

	t.deepEqual(r[2].match, ['myAppId', 'myFlightId', '/submissions']);
	t.is(r[2].headers.Authorization, 'Bearer myAccessToken');

	t.deepEqual(r[3].match, ['myAppId', 'myFlightId', '/submissions/mySubmissionId']);
	t.is(r[3].headers.Authorization, 'Bearer myAccessToken');
	t.deepEqual(r[3].params, {
		flightPackages: [
			{ fileName: 'package.appx', fileStatus: 'PendingUpload', minimumDirectXVersion: 'None', minimumSystemRam: 'None' },
			{ fileName: 'foo', fileStatus: 'PendingDelete' }
		],
		fileUploadUrl: 'https://mockfileupload.url',
		id: 'mySubmissionId'
	});

	t.deepEqual(r[4].match, ['https://mockfileupload.url']);
	t.is(r[4].headers.Authorization, undefined, 'no auth header for file upload');
	t.is(r[4].headers['x-ms-blob-type'], 'BlockBlob');
	t.true(r[4].params instanceof Buffer);

	t.deepEqual(r[5].match, ['myAppId', 'myFlightId', '/submissions/thisIdWontActuallyChangeInPractice/commit']);
	t.is(r[5].headers.Authorization, 'Bearer myAccessToken');

	t.deepEqual(r[6].match, ['myAppId', 'myFlightId', '/submissions/thisIdWontActuallyChangeInPractice/status']);
	t.is(r[6].headers.Authorization, 'Bearer myAccessToken');

	t.is(t.context.requests.length, 7);
});

test.serial('full publish to flight, with pending submission', async t => {
	t.context.responses = [
		{ access_token: 'myAccessToken' },
		{ pendingFlightSubmission: { id: 'mySubmissionCode' } },
		{},
		{ fileUploadUrl: 'https://mockfileupload.url', id: 'mySubmissionId', flightPackages: [{ fileName: 'foo', fileStatus: 'Uploaded' }] },
		{ fileUploadUrl: 'https://mockfileupload.url', id: 'thisIdWontActuallyChangeInPractice', flightPackages: [{ fileName: 'foo', fileStatus: 'Uploaded' }] },
		{},
		{},
		{ status: 'PreProcessing' }
	];

	await deploy({ tenantId: 'myTenantId', clientId: 'myClientId', clientSecret: 'myClientSecret', appId: 'myAppId', flightId: 'myFlightId', appx: new EmptyStream() });

	const r = t.context.requests;

	t.deepEqual(r[0].match, ['myTenantId']);

	t.deepEqual(r[1].match, ['myAppId', 'myFlightId', '']);
	t.is(r[1].headers.Authorization, 'Bearer myAccessToken');

	t.deepEqual(r[2].match, ['myAppId', 'myFlightId', '/submissions/mySubmissionCode']);
	t.is(r[2].headers.Authorization, 'Bearer myAccessToken');

	t.deepEqual(r[3].match, ['myAppId', 'myFlightId', '/submissions']);
	t.is(r[3].headers.Authorization, 'Bearer myAccessToken');

	t.deepEqual(r[4].match, ['myAppId', 'myFlightId', '/submissions/mySubmissionId']);
	t.is(r[4].headers.Authorization, 'Bearer myAccessToken');
	t.deepEqual(r[4].params, {
		flightPackages: [
			{ fileName: 'package.appx', fileStatus: 'PendingUpload', minimumDirectXVersion: 'None', minimumSystemRam: 'None' },
			{ fileName: 'foo', fileStatus: 'PendingDelete' }
		],
		fileUploadUrl: 'https://mockfileupload.url',
		id: 'mySubmissionId'
	});

	t.deepEqual(r[5].match, ['https://mockfileupload.url']);
	t.is(r[5].headers.Authorization, undefined, 'no auth header for file upload');
	t.is(r[5].headers['x-ms-blob-type'], 'BlockBlob');
	t.true(r[5].params instanceof Buffer);

	t.deepEqual(r[6].match, ['myAppId', 'myFlightId', '/submissions/thisIdWontActuallyChangeInPractice/commit']);
	t.is(r[6].headers.Authorization, 'Bearer myAccessToken');

	t.deepEqual(r[7].match, ['myAppId', 'myFlightId', '/submissions/thisIdWontActuallyChangeInPractice/status']);
	t.is(r[7].headers.Authorization, 'Bearer myAccessToken');
});
