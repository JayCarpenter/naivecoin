require('mocha-steps');
const supertest = require('supertest');
const assert = require('assert');
const HttpServer = require('../lib/httpServer');
const Blockchain = require('../lib/blockchain');
const Operator = require('../lib/operator');
const Miner = require('../lib/miner');
const Node = require('../lib/node');
const fs = require('fs-extra');

const logLevel = 0;

require('../lib/util/consoleWrapper.js')('integrationTest', logLevel);

describe('Integration Test', () => {
    const name1 = 'integrationTest1';
    const name2 = 'integrationTest2';

    let createNaivecoin = (name, host, port, peers, removeData = true) => {
        if (removeData) fs.removeSync('data/' + name + '/');
        let blockchain = new Blockchain(name);
        let operator = new Operator(name, blockchain);
        let miner = new Miner(blockchain, logLevel);
        let node = new Node(host, port, peers, blockchain);
        let httpServer = new HttpServer(node, blockchain, operator, miner);
        return httpServer.listen(host, port);
    };

    const walletPassword = 't t t t t';
    let context = {};

    step('start server 1', () => {
        return createNaivecoin(name1, 'localhost', 3001, [])
            .then((httpServer) => {
                context.httpServer1 = httpServer;
            });
    });

    step('create wallet', () => {
        return Promise.resolve()
            .then(() => {
                return supertest(context.httpServer1.app)
                    .post('/operator/wallets')
                    .send({ password: walletPassword })
                    .expect(201);
            }).then((res) => {
                context.walletId = res.body.id;
            });
    });

    step('create address 1', () => {
        return Promise.resolve()
            .then(() => {
                return supertest(context.httpServer1.app)
                    .post(`/operator/wallets/${context.walletId}/addresses`)
                    .set({ password: walletPassword })
                    .expect(201);
            }).then((res) => {
                context.address1 = res.body.address;
            });
    });

    step('create address 2', () => {
        return Promise.resolve()
            .then(() => {
                return supertest(context.httpServer1.app)
                    .post(`/operator/wallets/${context.walletId}/addresses`)
                    .set({ password: walletPassword })
                    .expect(201);
            }).then((res) => {
                context.address2 = res.body.address;
            });
    });

    step('mine an empty block', () => {
        return Promise.resolve()
            .then(() => {
                return supertest(context.httpServer1.app)
                    .post('/miner/mine')
                    .send({ rewardAddress: context.address1 })
                    .expect(201);
            });
    });

    step('create a transaction', () => {
        return Promise.resolve()
            .then(() => {
                return supertest(context.httpServer1.app)
                    .post(`/operator/wallets/${context.walletId}/transactions`)
                    .set({ password: walletPassword })
                    .send({
                        fromAddress: context.address1,
                        toAddress: context.address2,
                        amount: 1000000000,
                        changeAddress: context.address1
                    })
                    .expect(201);
            })
            .then((res) => {
                context.transactionId = res.body.id;
            });
    });

    step('mine a block with transactions', () => {
        return Promise.resolve()
            .then(() => {
                return supertest(context.httpServer1.app)
                    .post('/miner/mine')
                    .send({ rewardAddress: context.address1 })
                    .expect(201);
            });
    });

    step('check confirmations for the created transaction', () => {
        return Promise.resolve()
            .then(() => {
                return supertest(context.httpServer1.app)
                    .get(`/node/transactions/${context.transactionId}/confirmations`)
                    .expect(200)
                    .expect((res) => {
                        assert.equal(res.body.confirmations, 1, `Expected confirmations of transaction '${context.transactionId}' to be '1'`);
                    });
            });
    });

    step('check address 1 balance', () => {
        return Promise.resolve()
            .then(() => {
                return supertest(context.httpServer1.app)
                    .get(`/operator/wallets/${context.walletId}/addresses/${context.address1}/balance`)
                    .expect(200)
                    .expect((res) => {
                        assert.equal(res.body.balance, 9000000000, `Expected balance of address '${context.address1}' to be '9000000000'`);
                    });
            });
    });

    step('check address 2 balance', () => {
        return Promise.resolve()
            .then(() => {
                return supertest(context.httpServer1.app)
                    .get(`/operator/wallets/${context.walletId}/addresses/${context.address2}/balance`)
                    .expect(200)
                    .expect((res) => {
                        assert.equal(res.body.balance, 1000000000, `Expected balance of address '${context.address2}' to be '1000000000'`);
                    });
            });
    });

    step('check unspent transaction from address 1', () => {
        return Promise.resolve()
            .then(() => {
                return supertest(context.httpServer1.app)
                    .get('/blockchain/transactions/unspent')
                    .query({ address: context.address1 })
                    .expect(200)
                    .expect((res) => {
                        assert.equal(res.body.length, 3, `Expected unspent transactions of address '${context.address1}' to be '3'`);
                    });
            });
    });

    step('start server 2', () => {
        return createNaivecoin(name2, 'localhost', 3002, [{ url: 'http://localhost:3001' }])
            .then((httpServer) => {
                context.httpServer2 = httpServer;
            });
    });

    step('wait for nodes synchronization', () => {
        return Promise.resolve()
            .then(() => {
                return new Promise(function (resolve) {
                    setTimeout(function () {
                        resolve();
                    }, 1000); // Wait 1s then resolve.
                });
            });
    });

    step('check blockchain size in server 2', () => {
        return Promise.resolve()
            .then(() => {
                return supertest(context.httpServer2.app)
                    .get('/blockchain/blocks')
                    .expect(200)
                    .expect((res) => {
                        assert.equal(res.body.length, 3, 'Expected blockchain size of 3 on server 2');
                    });
            });
    });

    step('check confirmations from server 1 for the created transaction', () => {
        return Promise.resolve()
            .then(() => {
                return supertest(context.httpServer1.app)
                    .get(`/node/transactions/${context.transactionId}/confirmations`)
                    .expect(200)
                    .expect((res) => {
                        assert.equal(res.body.confirmations, 2, `Expected confirmations of transaction '${context.transactionId}' to be '2'`);
                    });
            });
    });

    step('check confirmations from server 2 for the created transaction', () => {
        return Promise.resolve()
            .then(() => {
                return supertest(context.httpServer2.app)
                    .get(`/node/transactions/${context.transactionId}/confirmations`)
                    .expect(200)
                    .expect((res) => {
                        assert.equal(res.body.confirmations, 2, `Expected confirmations of transaction '${context.transactionId}' to be '2'`);
                    });
            });
    });

    step('create a new transaction', () => {
        return Promise.resolve()
            .then(() => {
                return supertest(context.httpServer1.app)
                    .post(`/operator/wallets/${context.walletId}/transactions`)
                    .set({ password: walletPassword })
                    .send({
                        fromAddress: context.address1,
                        toAddress: context.address2,
                        amount: 1000000000,
                        changeAddress: context.address1
                    })
                    .expect(201);
            })
            .then((res) => {
                context.transactionId = res.body.id;
            });
    });

    step('wait for nodes synchronization', () => {
        return Promise.resolve()
            .then(() => {
                return new Promise(function (resolve) {
                    setTimeout(function () {
                        resolve();
                    }, 1000); // Wait 1s then resolve.
                });
            });
    });

    step('check transactions', () => {
        return Promise.resolve()
            .then(() => {
                return supertest(context.httpServer1.app)
                    .get('/blockchain/transactions')
                    .expect(200)
                    .expect((res) => {
                        assert.equal(res.body.length, 1, `Expected transactions size of '${context.transactionId}' to be '1'`);
                    });
            })
            .then((res) => {
                context.transactionId = res.body.id;
            });
    });

    step('stop server 2', () => {
        return Promise.resolve()
            .then(() => {
                return context.httpServer2.stop();
            });
    });

    // Complementary tests to reach untested paths
    describe('Complementary tests', () => {
        step('get wallets', () => {
            return Promise.resolve()
                .then(() => {
                    return supertest(context.httpServer1.app)
                        .get('/operator/wallets')
                        .expect(200)
                        .expect((res) => {
                            assert.equal(res.body.length, 1, 'Expected 1 wallet.');
                            assert.equal(res.body[0].addresses.length, 2, 'Expected 2 addresses.');
                        });
                });
        });

        step('get wallet addresses', () => {
            return Promise.resolve()
                .then(() => {
                    return supertest(context.httpServer1.app)
                        .get(`/operator/wallets/${context.walletId}/addresses`)
                        .expect(200)
                        .expect((res) => {
                            assert.equal(res.body.length, 2, 'Expected 2 addresses.');
                        });
                });
        });

        step('get wallet', () => {
            return Promise.resolve()
                .then(() => {
                    return supertest(context.httpServer1.app)
                        .get(`/operator/wallets/${context.walletId}`)
                        .expect(200)
                        .expect((res) => {
                            assert.equal(res.body.addresses.length, 2, 'Expected 2 addresses.');
                        });
                });
        });

        step('restart server 1', () => {
            return Promise.resolve()
                .then(() => {
                    return context.httpServer1.stop();
                })
                .then(() => {
                    return createNaivecoin(name1, 'localhost', 3001, [], false)
                        .then((httpServer) => {
                            context.httpServer1 = httpServer;
                        });
                });
        });

        step('check address 1 balance', () => {
            return Promise.resolve()
                .then(() => {
                    return supertest(context.httpServer1.app)
                        .get(`/operator/${context.address1}/balance`)
                        .expect(200)
                        .expect((res) => {
                            assert.equal(res.body.balance, 9000000000, `Expected balance of address '${context.address1}' to be '9000000000'`);
                        });
                });
        });

        step('get latest block', () => {
            return Promise.resolve()
                .then(() => {
                    return supertest(context.httpServer1.app)
                        .get('/blockchain/blocks/latest')
                        .expect(200);
                })
                .then((res) => {
                    context.latestBlock = {
                        hash: res.body.hash,
                        index: res.body.index
                    };
                });
        });

        step('get block by hash', () => {
            return Promise.resolve()
                .then(() => {
                    return supertest(context.httpServer1.app)
                        .get(`/blockchain/blocks/${context.latestBlock.hash}`)
                        .expect(200)
                        .expect((res) => {
                            assert.equal(res.body.hash, context.latestBlock.hash , `Expected hash of block index '${context.latestBlock.index}' to be '${context.latestBlock.hash}'`);
                        });
                });
        });

        step('get block by index', () => {
            return Promise.resolve()
                .then(() => {
                    return supertest(context.httpServer1.app)
                        .get(`/blockchain/blocks/${context.latestBlock.index}`)
                        .expect(200)
                        .expect((res) => {
                            assert.equal(res.body.index, context.latestBlock.index , `Expected index of block hash '${context.latestBlock.hash}' to be '${context.latestBlock.index}'`);
                        });
                });
        });

        step('stop server 1', () => {
            return Promise.resolve()
                .then(() => {
                    return context.httpServer1.stop();
                });
        });
    });
});