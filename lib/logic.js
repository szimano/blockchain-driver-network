/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';
/**
 * Write your transction processor functions here
 */

/**
 * Sample transaction
 * @param {com.softwaremill.drivernetwork.SampleTransaction} sampleTransaction
 * @transaction
 */
// async function sampleTransaction(tx) {
//     // Save the old value of the asset.
//     const oldValue = tx.asset.value;

//     // Update the asset with the new value.
//     tx.asset.value = tx.newValue;

//     // Get the asset registry for the asset.
//     const assetRegistry = await getAssetRegistry('com.softwaremill.drivernetwork.SampleAsset');
//     // Update the asset in the asset registry.
//     await assetRegistry.update(tx.asset);

//     // Emit an event for the modified asset.
//     let event = getFactory().newEvent('com.softwaremill.drivernetwork', 'SampleEvent');
//     event.asset = tx.asset;
//     event.oldValue = oldValue;
//     event.newValue = tx.newValue;
//     emit(event);
// }

const uuid = ()=>([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,a=>(a^Math.random()*16>>a/4).toString(16));

/**
 * Reject fine
 * @param {com.softwaremill.drivernetwork.RejectedFine} rejectedFine
 * @transaction
 */
async function rejectedFine(rejectedFine) {
    console.log(`Rejecting fine ${rejectedFine}`);
    const fineRegistry = await getAssetRegistry('com.softwaremill.drivernetwork.Fine');

    rejectedFine.fine.fineState = 'REJECTED';
    await fineRegistry.update(rejectedFine.fine);

    const courtCaseRegistry = await getAssetRegistry(
        'com.softwaremill.drivernetwork.CourtCase');

    const courtCase = getFactory().newResource(
        'com.softwaremill.drivernetwork', 'CourtCase', uuid());;
    courtCase.fine = rejectedFine.fine;

    await courtCaseRegistry.add(courtCase);
}

/**
 * Accept fine
 * @param {com.softwaremill.drivernetwork.AcceptedFine} acceptedFine
 * @transaction
 */
async function acceptedFine(acceptedFine) {
    console.log(`Accepting fine ${acceptedFine}`);

    const fineRegistry = await getAssetRegistry('com.softwaremill.drivernetwork.Fine');

    acceptedFine.fine.fineState = 'ACCEPTED';
    await fineRegistry.update(acceptedFine.fine);
}
