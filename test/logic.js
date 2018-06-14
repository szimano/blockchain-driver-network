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
 * Write the unit tests for your transction processor functions here
 */

const AdminConnection = require('composer-admin').AdminConnection;
const BusinessNetworkConnection = require('composer-client').BusinessNetworkConnection;
const { BusinessNetworkDefinition, CertificateUtil, IdCard } = require('composer-common');
const path = require('path');

const chai = require('chai');
chai.should();
chai.use(require('chai-as-promised'));

const namespace = 'com.softwaremill.drivernetwork';
const driverType = 'Driver';
const driverNS = namespace + '.' + driverType;
const lawEnforcerType = 'LawEnforcer';
const lawEnforcerNS = namespace + '.' + lawEnforcerType;
const fineType = 'Fine';
const fineNS = namespace + '.' + fineType;

describe('#' + namespace, () => {
    // In-memory card store for testing so cards are not persisted to the file system
    const cardStore = require('composer-common').NetworkCardStoreManager.getCardStore( { type: 'composer-wallet-inmemory' } );

    // Embedded connection used for local testing
    const connectionProfile = {
        name: 'embedded',
        'x-type': 'embedded'
    };

    // Name of the business network card containing the administrative identity for the business network
    const adminCardName = 'admin';

    // Admin connection to the blockchain, used to deploy the business network
    let adminConnection;

    // This is the business network connection the tests will use.
    let businessNetworkConnection;

    // This is the factory for creating instances of types.
    let factory;

    // These are the identities for Alice and Bob.
    const aliceCardName = 'alice';
    const bobCardName = 'bob';
    const policeCardName = 'police';

    // These are a list of receieved events.
    let events;

    let businessNetworkName;

    before(async () => {
        // Generate certificates for use with the embedded connection
        const credentials = CertificateUtil.generate({ commonName: 'admin' });

        // Identity used with the admin connection to deploy business networks
        const deployerMetadata = {
            version: 1,
            userName: 'PeerAdmin',
            roles: [ 'PeerAdmin', 'ChannelAdmin' ]
        };
        const deployerCard = new IdCard(deployerMetadata, connectionProfile);
        deployerCard.setCredentials(credentials);
        const deployerCardName = 'PeerAdmin';

        adminConnection = new AdminConnection({ cardStore: cardStore });

        await adminConnection.importCard(deployerCardName, deployerCard);
        await adminConnection.connect(deployerCardName);
    });

    /**
     *
     * @param {String} cardName The card name to use for this identity
     * @param {Object} identity The identity details
     */
    async function importCardForIdentity(cardName, identity) {
        const metadata = {
            userName: identity.userID,
            version: 1,
            enrollmentSecret: identity.userSecret,
            businessNetwork: businessNetworkName
        };
        const card = new IdCard(metadata, connectionProfile);
        await adminConnection.importCard(cardName, card);
    }

    // This is called before each test is executed.
    beforeEach(async () => {
        // Generate a business network definition from the project directory.
        let businessNetworkDefinition = await BusinessNetworkDefinition.fromDirectory(path.resolve(__dirname, '..'));
        businessNetworkName = businessNetworkDefinition.getName();
        await adminConnection.install(businessNetworkDefinition);
        const startOptions = {
            networkAdmins: [
                {
                    userName: 'admin',
                    enrollmentSecret: 'adminpw'
                }
            ]
        };
        const adminCards = await adminConnection.start(businessNetworkName, businessNetworkDefinition.getVersion(), startOptions);
        await adminConnection.importCard(adminCardName, adminCards.get('admin'));

        // Create and establish a business network connection
        businessNetworkConnection = new BusinessNetworkConnection({ cardStore: cardStore });
        events = [];
        businessNetworkConnection.on('event', event => {
            events.push(event);
        });
        await businessNetworkConnection.connect(adminCardName);

        // Get the factory for the business network.
        factory = businessNetworkConnection.getBusinessNetwork().getFactory();

        const driverRegistry = await businessNetworkConnection.getParticipantRegistry(driverNS);
        // Create the drivers.
        const alice = factory.newResource(namespace, driverType, 'driver1');
        alice.firstName = 'Alice';
        alice.lastName = 'A';

        const bob = factory.newResource(namespace, driverType, 'driver2');
        bob.firstName = 'Bob';
        bob.lastName = 'B';

        driverRegistry.addAll([alice, bob]);

        const laweEnforcerRegistry = await businessNetworkConnection.getParticipantRegistry(lawEnforcerNS);
        // Create the assets.
        const police = factory.newResource(namespace, lawEnforcerType, 'police1');
        // asset1.owner = factory.newRelationship(namespace, participantType, 'alice@email.com');
        police.lawEnforcerType = 'POLICE';

        laweEnforcerRegistry.addAll([police]);

        // Issue the identities.
        let identity = await businessNetworkConnection.issueIdentity(driverNS + '#driver1', 'alice1');
        await importCardForIdentity(aliceCardName, identity);
        identity = await businessNetworkConnection.issueIdentity(driverNS + '#driver2', 'bob1');
        await importCardForIdentity(bobCardName, identity);
        identity = await businessNetworkConnection.issueIdentity(lawEnforcerNS + '#police1', 'police1');
        await importCardForIdentity(policeCardName, identity);
    });

    const uuid = ()=>([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,a=>(a^Math.random()*16>>a/4).toString(16));

    /**
     * Reconnect using a different identity.
     * @param {String} cardName The name of the card for the identity to use
     */
    async function useIdentity(cardName) {
        await businessNetworkConnection.disconnect();
        businessNetworkConnection = new BusinessNetworkConnection({ cardStore: cardStore });
        events = [];
        businessNetworkConnection.on('event', (event) => {
            events.push(event);
        });
        await businessNetworkConnection.connect(cardName);
        factory = businessNetworkConnection.getBusinessNetwork().getFactory();
    }

    /**
     * @param {Number} penaltyPoints
     * @param {String} driverId
     */
    async function issueFine(penaltyPoints, driverId) {
        const fineRegistry = await businessNetworkConnection.getAssetRegistry(fineNS);

        const fine = factory.newResource(namespace, fineType, uuid());
        fine.penaltyPoints = penaltyPoints;
        fine.date = new Date();
        fine.driver = factory.newRelationship(namespace, driverType, driverId);
        fine.lawEnforcer = factory.newRelationship(namespace, lawEnforcerType, 'police1');

        await fineRegistry.add(fine); 
        
        return fine.fineId;
    }

    /**
     * @param {String} fineId
     */
    async function acceptFine(fineId) {
        const transaction = factory.newTransaction(namespace, 'AcceptedFine');
        transaction.fine = factory.newRelationship(namespace, fineType, fineId);

        await businessNetworkConnection.submitTransaction(transaction);        
    }

    /**
     * @param {String} fineId
     */
    async function rejectFine(fineId) {
        const transaction = factory.newTransaction(namespace, 'RejectedFine');
        transaction.fine = factory.newRelationship(namespace, fineType, fineId);

        await businessNetworkConnection.submitTransaction(transaction);        
    }

    it('Police can issue a fine', async () => {
        // Use the identity for Alice.
        await useIdentity(policeCardName);
        
        const fineRegistry = await businessNetworkConnection.getAssetRegistry(fineNS);        
        let fines = await fineRegistry.getAll();

        // Validate the assets.
        fines.should.have.lengthOf(0);

        const fineId = await issueFine(10, 'driver1');

        fines = await fineRegistry.getAll();

        fines.should.have.lengthOf(1);
        const fine1 = fines[0];
        fine1.driver.getFullyQualifiedIdentifier().should.equal(driverNS + '#driver1');
        fine1.lawEnforcer.getFullyQualifiedIdentifier().should.equal(lawEnforcerNS + '#police1');
        fine1.penaltyPoints.should.equal(10);
    });

    it('Driver can accept a fine', async () => {
        // given
        await useIdentity(policeCardName);
        const fineId = await issueFine(10, 'driver1');

        // when
        await useIdentity(aliceCardName);

        await acceptFine(fineId);

        // then
        const fineRegistry = await businessNetworkConnection.getAssetRegistry(fineNS);
        const fine = await fineRegistry.get(fineId);

        fine.fineState.should.equal('ACCEPTED');
    });

    it('Driver can reject a fine', async () => {
        // given
        await useIdentity(policeCardName);
        const fineId = await issueFine(10, 'driver1');

        // when
        await useIdentity(aliceCardName);

        await rejectFine(fineId);

        // then
        const fineRegistry = await businessNetworkConnection.getAssetRegistry(fineNS);
        const fine = await fineRegistry.get(fineId);

        fine.fineState.should.equal('REJECTED');
    });

    it('Drivers license should be invalidated when exceeding 21 points', async () => {
        // given
        await useIdentity(policeCardName);
        const fineId = await issueFine(25, 'driver1');

        // when
        await useIdentity(aliceCardName);

        await acceptFine(fineId);

        // then
        const driverRegistry = await businessNetworkConnection.getParticipantRegistry(driverNS);
        const driver = await driverRegistry.get('driver1');

        driver.licenseValid.should.equal(false);
    });
 
    it('Drivers license should be invalidated when exceeding 21 points from multiple fines', async () => {
        // given
        await useIdentity(policeCardName);
        const fineId1 = await issueFine(10, 'driver1');
        const fineId2 = await issueFine(7, 'driver1');
        const fineId3 = await issueFine(5, 'driver1');

        // when
        await useIdentity(aliceCardName);

        await acceptFine(fineId1);

        // then
        const driverRegistry = await businessNetworkConnection.getParticipantRegistry(driverNS);
        let driver = await driverRegistry.get('driver1');

        driver.licenseValid.should.equal(true);

        // and
        await acceptFine(fineId2);

        // then
        driver = await driverRegistry.get('driver1');

        driver.licenseValid.should.equal(true);

        // and
        await acceptFine(fineId3);

        // then
        driver = await driverRegistry.get('driver1');

        driver.licenseValid.should.equal(false);
    });

});
