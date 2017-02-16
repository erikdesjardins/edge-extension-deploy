/**
 * @author Erik Desjardins
 * See LICENSE file in root directory for full license.
 */

'use strict';

var request = require('superagent');
var yazl = require('yazl');

var REQUIRED_FIELDS = ['tenantId', 'clientId', 'clientSecret', 'appId', 'appx'];

function sleep(ms) {
	return new Promise(function(resolve) {
		setTimeout(resolve, ms);
	});
}

module.exports = function deploy(options) {
	var tenantId = options.tenantId;
	var clientId = options.clientId;
	var clientSecret = options.clientSecret;
	var appId = options.appId;
	var flightId = options.flightId;
	var appx = options.appx;

	var appAndFlight = 'https://manage.devcenter.microsoft.com/v1.0/my/applications/' + appId + (flightId ? '/flights/' + flightId : '');
	var accessToken, submissionInfo;

	// https://docs.microsoft.com/en-us/windows/uwp/monetize/python-code-examples-for-the-windows-store-submission-api
	return Promise.resolve()
		// options validation
		.then(function() {
			REQUIRED_FIELDS.forEach(function(field) {
				if (!options[field]) {
					throw new Error('Missing required field: ' + field);
				}
			});
		})
		// fetch Azure AD access token
		.then(function() {
			// https://docs.microsoft.com/en-us/windows/uwp/monetize/create-and-manage-submissions-using-windows-store-services#obtain-an-azure-ad-access-token
			return request
				.post('https://login.microsoftonline.com/' + tenantId + '/oauth2/token')
				.field('grant_type', 'client_credentials')
				.field('resource', 'https://manage.devcenter.microsoft.com')
				.field('client_id', clientId)
				.field('client_secret', clientSecret)
				.then(function(response) {
					var token = response.body.access_token;
					if (!token) {
						throw new Error('No access token received.');
					}
					accessToken = token;
				}, function(err) {
					throw new Error('Failed to fetch access token: ' + (err.response.body.error || err.response.status));
				});
		})
		// get app or flight info
		.then(function() {
			// https://docs.microsoft.com/en-us/windows/uwp/monetize/get-an-app
			// https://docs.microsoft.com/en-us/windows/uwp/monetize/get-a-flight
			return request
				.get(appAndFlight)
				.set('Authorization', 'Bearer ' + accessToken)
				.then(function(response) {
					if (flightId) {
						return response.body.pendingFlightSubmission;
					} else {
						return response.body.pendingApplicationSubmission;
					}
				}, function(err) {
					throw new Error('Failed to fetch ' + (flightId ? 'flight' : 'app') + ': ' + (err.response.body.code || err.response.status));
				});
		})
		// delete existing submission (if present)
		.then(function(pendingSubmission) {
			if (!pendingSubmission) return;

			// https://docs.microsoft.com/en-us/windows/uwp/monetize/delete-an-app-submission
			// https://docs.microsoft.com/en-us/windows/uwp/monetize/delete-a-flight-submission
			return request
				.delete(appAndFlight + '/submissions/' + pendingSubmission.id)
				.set('Authorization', 'Bearer ' + accessToken)
				.then(function() {
					// success
				}, function(err) {
					throw new Error('Failed to delete previous submission: ' + (err.response.body.code || err.response.status));
				});
		})
		// create new submission
		.then(function() {
			// https://docs.microsoft.com/en-us/windows/uwp/monetize/create-an-app-submission
			// https://docs.microsoft.com/en-us/windows/uwp/monetize/create-an-app-submission
			return request
				.post(appAndFlight + '/submissions')
				.set('Authorization', 'Bearer ' + accessToken)
				.then(function(response) {
					submissionInfo = response.body;
				}, function(err) {
					throw new Error('Failed to create new submission: ' + (err.response.body.code || err.response.status));
				});
		})
		// prepare zip file
		.then(function() {
			return new Promise(function(resolve, reject) {
				var zipFile = new yazl.ZipFile();
				zipFile.addReadStream(appx, 'package.appx');
				zipFile.end();

				var bufs = [];
				zipFile.outputStream.on('data', function(buf) {
					bufs.push(buf);
				});
				zipFile.outputStream.on('end', function() {
					resolve(Buffer.concat(bufs));
				});
				zipFile.outputStream.on('error', reject);
			});
		})
		// upload package
		.then(function(zipFileBuffer) {
			return request
				.put(submissionInfo.fileUploadUrl.replace(/\+/g, '%2B'))
				.set('x-ms-blob-type', 'BlockBlob')
				.send(zipFileBuffer)
				.then(function() {
					// success
				}, function(err) {
					throw new Error('Failed to upload package: ' + (err.response.body.code || err.response.status));
				});
		})
		// update the submission to intake the new package
		.then(function() {
			// https://docs.microsoft.com/en-us/windows/uwp/monetize/update-an-app-submission
			// https://docs.microsoft.com/en-us/windows/uwp/monetize/update-a-flight-submission
			return request
				.put(appAndFlight + '/submissions/' + submissionInfo.id)
				.set('Authorization', 'Bearer ' + accessToken)
				.send(Object.assign({}, submissionInfo, {
					[flightId ? 'flightPackages' : 'applicationPackages']: [{
						fileName: 'package.appx',
						fileStatus: 'PendingUpload',
						minimumDirectXVersion: 'None',
						minimumSystemRam: 'None'
					}].concat(submissionInfo[flightId ? 'flightPackages' : 'applicationPackages'].map(function(pack) {
						// remove old packages
						return Object.assign({}, pack, {
							fileStatus: 'PendingDelete'
						});
					}))
				}))
				.then(function(response) {
					submissionInfo = response.body;
				}, function(err) {
					throw new Error('Failed to update submission: ' + (err.response.body.code || err.response.status));
				});
		})
		// commit new submission
		.then(function() {
			// https://docs.microsoft.com/en-us/windows/uwp/monetize/commit-an-app-submission
			// https://docs.microsoft.com/en-us/windows/uwp/monetize/commit-an-app-submission
			return request
				.post(appAndFlight + '/submissions/' + submissionInfo.id + '/commit')
				.set('Authorization', 'Bearer ' + accessToken)
				.then(function() {
					// success
				}, function(err) {
					throw new Error('Failed to commit submission: ' + (err.response.body.code || err.response.status));
				});
		})
		// poll for completion
		.then(function poll() {
			// https://docs.microsoft.com/en-us/windows/uwp/monetize/get-status-for-an-app-submission
			// https://docs.microsoft.com/en-us/windows/uwp/monetize/get-status-for-a-flight-submission
			return request
				.get(appAndFlight + '/submissions/' + submissionInfo.id + '/status')
				.set('Authorization', 'Bearer ' + accessToken)
				.then(function(response) {
					// https://github.com/Microsoft/StoreBroker/blob/master/Documentation/USAGE.md#status-progression
					var status = response.body.status;
					if (status === 'PendingCommit' || status === 'CommitStarted') {
						// try again
						return sleep(30000).then(poll);
					} else if (
						status !== 'PreProcessing' &&
						// anything other than PreProcessing is unlikely,
						// but techincally possible if the store is _really_ fast
						status !== 'Certification' &&
						status !== 'Release'
					) {
						throw new Error('Failed: ' + status + ' ' + JSON.stringify(response.body.statusDetails));
					}
				}, function(err) {
					throw new Error('Failed to poll for commit status: ' + (err.response.body.code || err.response.status));
				});
		});
};
