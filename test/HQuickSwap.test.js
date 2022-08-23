const {
  balance,
  BN,
  constants,
  ether,
  expectEvent,
  expectRevert,
  time,
} = require('@openzeppelin/test-helpers');
const { tracker } = balance;
const { MAX_UINT256 } = constants;
const { latest } = time;
const abi = require('ethereumjs-abi');
const utils = web3.utils;
const { expect } = require('chai');
const {
  USDC_TOKEN,
  WMATIC_TOKEN,
  WETH_TOKEN,
  QUICKSWAP_ROUTER,
  MATIC_TOKEN,
} = require('./utils/constants');
const {
  evmRevert,
  evmSnapshot,
  mulPercent,
  profileGas,
  getHandlerReturn,
  decimal6,
  tokenProviderSushi,
} = require('./utils/utils');

const HQuickSwap = artifacts.require('HQuickSwap');
const Registry = artifacts.require('Registry');
const FeeRuleRegistry = artifacts.require('FeeRuleRegistry');
const Proxy = artifacts.require('ProxyMock');
const IToken = artifacts.require('IERC20');
const IUniswapV2Router = artifacts.require('IUniswapV2Router02');

contract('QuickSwap Swap', function([_, user, someone]) {
  let id;
  const slippage = new BN('3');

  before(async function() {
    this.registry = await Registry.new();
    this.hQuickSwap = await HQuickSwap.new();
    await this.registry.register(
      this.hQuickSwap.address,
      utils.asciiToHex('QuickSwap')
    );
    this.router = await IUniswapV2Router.at(QUICKSWAP_ROUTER);
    this.feeRuleRegistry = await FeeRuleRegistry.new('0', _);
    this.proxy = await Proxy.new(
      this.registry.address,
      this.feeRuleRegistry.address
    );
  });

  beforeEach(async function() {
    id = await evmSnapshot();
  });

  afterEach(async function() {
    await evmRevert(id);
  });

  describe('Matic to Token', function() {
    const tokenAddress = WETH_TOKEN;

    let balanceUser;
    let balanceProxy;
    let tokenUser;

    before(async function() {
      this.token = await IToken.at(tokenAddress);
    });

    beforeEach(async function() {
      balanceUser = await tracker(user);
      balanceProxy = await tracker(this.proxy.address);
      tokenUser = await this.token.balanceOf(user);
    });

    describe('Exact input', function() {
      it('normal', async function() {
        const value = ether('1');
        const to = this.hQuickSwap.address;
        const path = [WMATIC_TOKEN, tokenAddress];

        const result = await this.router.getAmountsOut(value, path, {
          from: user,
        });

        const data = abi.simpleEncode(
          'swapExactETHForTokens(uint256,uint256,address[]):(uint256[])',
          value,
          mulPercent(result, new BN('100').sub(slippage)),
          path
        );

        const receipt = await this.proxy.execMock(to, data, {
          from: user,
          value: value,
        });

        const handlerReturn = utils.toBN(
          getHandlerReturn(receipt, ['uint256'])[0]
        );
        expect(handlerReturn).to.be.bignumber.eq(result[result.length - 1]);

        expect(await this.token.balanceOf(user)).to.be.bignumber.eq(
          tokenUser.add(result[result.length - 1])
        );
        expect(
          await this.token.balanceOf(this.proxy.address)
        ).to.be.bignumber.eq(ether('0'));
        expect(await balanceProxy.delta()).to.be.bignumber.eq(ether('0'));
        expect(await balanceUser.delta()).to.be.bignumber.eq(
          ether('0').sub(ether('1'))
        );
        profileGas(receipt);
      });

      it('max amount', async function() {
        const value = ether('1');
        const to = this.hQuickSwap.address;
        const path = [WMATIC_TOKEN, tokenAddress];

        const result = await this.router.getAmountsOut(value, path, {
          from: user,
        });

        const data = abi.simpleEncode(
          'swapExactETHForTokens(uint256,uint256,address[]):(uint256[])',
          MAX_UINT256,
          mulPercent(result, new BN('100').sub(slippage)),
          path
        );

        const receipt = await this.proxy.execMock(to, data, {
          from: user,
          value: value,
        });

        const handlerReturn = utils.toBN(
          getHandlerReturn(receipt, ['uint256'])[0]
        );
        expect(handlerReturn).to.be.bignumber.eq(result[result.length - 1]);

        expect(await this.token.balanceOf(user)).to.be.bignumber.eq(
          tokenUser.add(result[result.length - 1])
        );
        expect(
          await this.token.balanceOf(this.proxy.address)
        ).to.be.bignumber.eq(ether('0'));
        expect(await balanceProxy.delta()).to.be.bignumber.eq(ether('0'));
        expect(await balanceUser.delta()).to.be.bignumber.eq(
          ether('0').sub(ether('1'))
        );
        profileGas(receipt);
      });

      it('min amount too high', async function() {
        const value = ether('1');
        const to = this.hQuickSwap.address;
        const path = [WMATIC_TOKEN, tokenAddress];
        const result = await this.router.getAmountsOut(value, path, {
          from: user,
        });
        const data = abi.simpleEncode(
          'swapExactETHForTokens(uint256,uint256,address[]):(uint256[])',
          value,
          result[result.length - 1].add(ether('0.1')),
          path
        );

        await expectRevert(
          this.proxy.execMock(to, data, { from: user, value: value }),
          'HQuickSwap_swapExactETHForTokens: UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT'
        );
        expect(await this.token.balanceOf(user)).to.be.bignumber.eq(tokenUser);
        expect(
          await this.token.balanceOf(this.proxy.address)
        ).to.be.bignumber.eq(ether('0'));
        expect(await balanceProxy.delta()).to.be.bignumber.eq(ether('0'));
      });

      it('invalid path', async function() {
        const value = ether('1');
        const to = this.hQuickSwap.address;
        const path = [tokenAddress, WMATIC_TOKEN];
        const data = abi.simpleEncode(
          'swapExactETHForTokens(uint256,uint256,address[]):(uint256[])',
          value,
          new BN('1'),
          path
        );
        await expectRevert(
          this.proxy.execMock(to, data, { from: user, value: value }),
          'HQuickSwap_swapExactETHForTokens: UniswapV2Router: INVALID_PATH'
        );
      });

      it('matic token', async function() {
        const value = ether('1');
        const to = this.hQuickSwap.address;
        const path = [WMATIC_TOKEN, MATIC_TOKEN];
        const data = abi.simpleEncode(
          'swapExactETHForTokens(uint256,uint256,address[]):(uint256[])',
          value,
          new BN('1'),
          path
        );
        await expectRevert(
          this.proxy.execMock(to, data, { from: user, value: value }),
          'HQuickSwap_swapExactETHForTokens: Unspecified'
        );
      });
    });

    describe('Exact output', function() {
      it('normal', async function() {
        const value = ether('10');
        const buyAmt = ether('0.001');
        const to = this.hQuickSwap.address;
        const path = [WMATIC_TOKEN, tokenAddress];
        const result = await this.router.getAmountsIn(buyAmt, path, {
          from: user,
        });
        const data = abi.simpleEncode(
          'swapETHForExactTokens(uint256,uint256,address[]):(uint256[])',
          mulPercent(result[0], new BN('100').add(slippage)),
          buyAmt,
          path
        );
        const receipt = await this.proxy.execMock(to, data, {
          from: user,
          value: value,
        });

        const handlerReturn = utils.toBN(
          getHandlerReturn(receipt, ['uint256'])[0]
        );
        const userBalanceDelta = await balanceUser.delta();

        expect(userBalanceDelta).to.be.bignumber.eq(
          ether('0').sub(handlerReturn)
        );

        expect(await this.token.balanceOf(user)).to.be.bignumber.eq(
          tokenUser.add(buyAmt)
        );
        expect(
          await this.token.balanceOf(this.proxy.address)
        ).to.be.bignumber.eq(ether('0'));
        expect(await balanceProxy.delta()).to.be.bignumber.eq(ether('0'));
        expect(userBalanceDelta).to.be.bignumber.eq(ether('0').sub(result[0]));
        profileGas(receipt);
      });

      it('max amount', async function() {
        const value = ether('10');
        const buyAmt = ether('0.001');
        const to = this.hQuickSwap.address;
        const path = [WMATIC_TOKEN, tokenAddress];
        const result = await this.router.getAmountsIn(buyAmt, path, {
          from: user,
        });
        const data = abi.simpleEncode(
          'swapETHForExactTokens(uint256,uint256,address[]):(uint256[])',
          MAX_UINT256,
          buyAmt,
          path
        );
        const receipt = await this.proxy.execMock(to, data, {
          from: user,
          value: value,
        });

        const handlerReturn = utils.toBN(
          getHandlerReturn(receipt, ['uint256'])[0]
        );
        const userBalanceDelta = await balanceUser.delta();

        expect(userBalanceDelta).to.be.bignumber.eq(
          ether('0').sub(handlerReturn)
        );

        expect(await this.token.balanceOf(user)).to.be.bignumber.eq(
          tokenUser.add(buyAmt)
        );
        expect(
          await this.token.balanceOf(this.proxy.address)
        ).to.be.bignumber.eq(ether('0'));
        expect(await balanceProxy.delta()).to.be.bignumber.eq(ether('0'));
        expect(userBalanceDelta).to.be.bignumber.eq(ether('0').sub(result[0]));
        profileGas(receipt);
      });

      it('insufficient matic', async function() {
        const buyAmt = ether('0.1');
        const to = this.hQuickSwap.address;
        const path = [WMATIC_TOKEN, tokenAddress];
        const result = await this.router.getAmountsIn(buyAmt, path, {
          from: user,
        });
        const value = result[0].sub(ether('0.01'));
        const data = abi.simpleEncode(
          'swapETHForExactTokens(uint256,uint256,address[]):(uint256[])',
          value,
          buyAmt,
          path
        );
        await expectRevert(
          this.proxy.execMock(to, data, {
            from: user,
            value: value,
          }),
          'HQuickSwap_swapETHForExactTokens: UniswapV2Router: EXCESSIVE_INPUT_AMOUNT'
        );
      });

      it('invalid path', async function() {
        const value = ether('1');
        const buyAmt = ether('100');
        const to = this.hQuickSwap.address;
        const path = [tokenAddress, WMATIC_TOKEN];
        const data = abi.simpleEncode(
          'swapETHForExactTokens(uint256,uint256,address[]):(uint256[])',
          value,
          buyAmt,
          path
        );
        await expectRevert(
          this.proxy.execMock(to, data, {
            from: user,
            value: value,
          }),
          'HQuickSwap_swapETHForExactTokens: UniswapV2Router: INVALID_PATH'
        );
      });

      it('matic token', async function() {
        const value = ether('1');
        const buyAmt = ether('100');
        const to = this.hQuickSwap.address;
        const path = [WMATIC_TOKEN, MATIC_TOKEN];
        const data = abi.simpleEncode(
          'swapETHForExactTokens(uint256,uint256,address[]):(uint256[])',
          value,
          buyAmt,
          path
        );
        await expectRevert(
          this.proxy.execMock(to, data, {
            from: user,
            value: value,
          }),
          'HQuickSwap_swapETHForExactTokens: Unspecified'
        );
      });
    });
  });

  describe('Token to Matic', function() {
    const tokenAddress = WETH_TOKEN;

    let balanceUser;
    let balanceProxy;
    let tokenUser;
    let providerAddress;

    before(async function() {
      providerAddress = await tokenProviderSushi(tokenAddress);

      this.token = await IToken.at(tokenAddress);
    });

    beforeEach(async function() {
      balanceUser = await tracker(user);
      balanceProxy = await tracker(this.proxy.address);
      tokenUser = await this.token.balanceOf(user);
    });

    describe('Exact input', function() {
      it('normal', async function() {
        const value = ether('1');
        const to = this.hQuickSwap.address;
        const path = [tokenAddress, WMATIC_TOKEN];
        const result = await this.router.getAmountsOut(value, path, {
          from: someone,
        });
        const data = abi.simpleEncode(
          'swapExactTokensForETH(uint256,uint256,address[]):(uint256[])',
          value,
          mulPercent(result, new BN('100').sub(slippage)),
          path
        );
        await this.token.transfer(this.proxy.address, value, {
          from: providerAddress,
        });
        await this.proxy.updateTokenMock(this.token.address);
        const receipt = await this.proxy.execMock(to, data, { from: user });

        const handlerReturn = utils.toBN(
          getHandlerReturn(receipt, ['uint256'])[0]
        );
        const userBalanceDelta = await balanceUser.delta();

        expect(userBalanceDelta).to.be.bignumber.eq(
          ether('0').add(handlerReturn)
        );

        expect(await this.token.balanceOf(user)).to.be.bignumber.eq(tokenUser);
        expect(
          await this.token.balanceOf(this.proxy.address)
        ).to.be.bignumber.eq(ether('0'));
        expect(await balanceProxy.delta()).to.be.bignumber.eq(ether('0'));
        expect(userBalanceDelta).to.be.bignumber.eq(
          ether('0').add(result[result.length - 1])
        );
        profileGas(receipt);
      });

      it('max amount', async function() {
        const value = ether('1');
        const to = this.hQuickSwap.address;
        const path = [tokenAddress, WMATIC_TOKEN];
        const result = await this.router.getAmountsOut(value, path, {
          from: someone,
        });
        const data = abi.simpleEncode(
          'swapExactTokensForETH(uint256,uint256,address[]):(uint256[])',
          MAX_UINT256,
          mulPercent(result, new BN('100').sub(slippage)),
          path
        );
        await this.token.transfer(this.proxy.address, value, {
          from: providerAddress,
        });
        await this.proxy.updateTokenMock(this.token.address);
        const receipt = await this.proxy.execMock(to, data, { from: user });

        const handlerReturn = utils.toBN(
          getHandlerReturn(receipt, ['uint256'])[0]
        );
        const userBalanceDelta = await balanceUser.delta();

        expect(userBalanceDelta).to.be.bignumber.eq(
          ether('0').add(handlerReturn)
        );

        expect(await this.token.balanceOf(user)).to.be.bignumber.eq(tokenUser);
        expect(
          await this.token.balanceOf(this.proxy.address)
        ).to.be.bignumber.eq(ether('0'));
        expect(await balanceProxy.delta()).to.be.bignumber.eq(ether('0'));
        expect(userBalanceDelta).to.be.bignumber.eq(
          ether('0').add(result[result.length - 1])
        );
        profileGas(receipt);
      });

      it('min output too high', async function() {
        const value = ether('1');
        const to = this.hQuickSwap.address;
        const path = [tokenAddress, WMATIC_TOKEN];
        await this.token.transfer(this.proxy.address, value, {
          from: providerAddress,
        });
        await this.proxy.updateTokenMock(this.token.address);
        const result = await this.router.getAmountsOut(value, path, {
          from: someone,
        });
        const data = abi.simpleEncode(
          'swapExactTokensForETH(uint256,uint256,address[]):(uint256[])',
          value,
          result[result.length - 1].add(ether('0.1')),
          path
        );
        await expectRevert(
          this.proxy.execMock(to, data, { from: user }),
          'HQuickSwap_swapExactTokensForETH: UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT'
        );
      });

      it('invalid path', async function() {
        const value = ether('1');
        const to = this.hQuickSwap.address;
        const path = [tokenAddress, WMATIC_TOKEN, tokenAddress];
        const data = abi.simpleEncode(
          'swapExactTokensForETH(uint256,uint256,address[]):(uint256[])',
          value,
          new BN('1'),
          path
        );
        await this.token.transfer(this.proxy.address, value, {
          from: providerAddress,
        });
        await this.proxy.updateTokenMock(this.token.address);
        await expectRevert(
          this.proxy.execMock(to, data, { from: user }),
          'HQuickSwap_swapExactTokensForETH: UniswapV2Router: INVALID_PATH'
        );
      });

      it('matic token', async function() {
        const value = ether('1');
        const to = this.hQuickSwap.address;
        const path = [MATIC_TOKEN, WMATIC_TOKEN];
        const data = abi.simpleEncode(
          'swapExactTokensForETH(uint256,uint256,address[]):(uint256[])',
          value,
          new BN('1'),
          path
        );
        await expectRevert(
          this.proxy.execMock(to, data, { from: user }),
          'Not support matic token'
        );
      });
    });

    describe('Exact output', function() {
      it('normal', async function() {
        const value = ether('1');
        const buyAmt = ether('1');
        const to = this.hQuickSwap.address;
        const path = [tokenAddress, WMATIC_TOKEN];
        const result = await this.router.getAmountsIn(buyAmt, path, {
          from: someone,
        });
        const data = abi.simpleEncode(
          'swapTokensForExactETH(uint256,uint256,address[]):(uint256[])',
          buyAmt,
          mulPercent(result[0], new BN('100').add(slippage)),
          path
        );
        await this.token.transfer(this.proxy.address, value, {
          from: providerAddress,
        });
        await this.proxy.updateTokenMock(this.token.address);
        const receipt = await this.proxy.execMock(to, data, {
          from: user,
        });
        const handlerReturn = utils.toBN(
          getHandlerReturn(receipt, ['uint256'])[0]
        );
        const userBalanceDelta = await balanceUser.delta();
        expect(handlerReturn).to.be.bignumber.eq(result[0]);
        expect(await this.token.balanceOf(user)).to.be.bignumber.eq(
          tokenUser.add(value).sub(result[0])
        );
        expect(
          await this.token.balanceOf(this.proxy.address)
        ).to.be.bignumber.eq(ether('0'));
        expect(await balanceProxy.delta()).to.be.bignumber.eq(ether('0'));
        expect(userBalanceDelta).to.be.bignumber.eq(buyAmt);
        profileGas(receipt);
      });

      it('max amount', async function() {
        const value = ether('1');
        const buyAmt = ether('1');
        const to = this.hQuickSwap.address;
        const path = [tokenAddress, WMATIC_TOKEN];
        const result = await this.router.getAmountsIn(buyAmt, path, {
          from: someone,
        });
        const data = abi.simpleEncode(
          'swapTokensForExactETH(uint256,uint256,address[]):(uint256[])',
          buyAmt,
          MAX_UINT256,
          path
        );
        await this.token.transfer(this.proxy.address, value, {
          from: providerAddress,
        });
        await this.proxy.updateTokenMock(this.token.address);
        const receipt = await this.proxy.execMock(to, data, {
          from: user,
        });
        const handlerReturn = utils.toBN(
          getHandlerReturn(receipt, ['uint256'])[0]
        );
        const userBalanceDelta = await balanceUser.delta();
        expect(handlerReturn).to.be.bignumber.eq(result[0]);
        expect(await this.token.balanceOf(user)).to.be.bignumber.eq(
          tokenUser.add(value).sub(result[0])
        );
        expect(
          await this.token.balanceOf(this.proxy.address)
        ).to.be.bignumber.eq(ether('0'));
        expect(await balanceProxy.delta()).to.be.bignumber.eq(ether('0'));
        expect(userBalanceDelta).to.be.bignumber.eq(buyAmt);
        profileGas(receipt);
      });

      it('insufficient input token', async function() {
        const value = ether('1');
        const buyAmt = ether('10000');
        const to = this.hQuickSwap.address;
        const path = [tokenAddress, WMATIC_TOKEN];
        const data = abi.simpleEncode(
          'swapTokensForExactETH(uint256,uint256,address[]):(uint256[])',
          buyAmt,
          value,
          path
        );
        await this.token.transfer(this.proxy.address, value, {
          from: providerAddress,
        });
        await this.proxy.updateTokenMock(this.token.address);
        await expectRevert(
          this.proxy.execMock(to, data, { from: user }),
          'HQuickSwap_swapTokensForExactETH: UniswapV2Router: EXCESSIVE_INPUT_AMOUNT'
        );
      });

      it('invalid path', async function() {
        const value = ether('1');
        const buyAmt = ether('1');
        const to = this.hQuickSwap.address;
        const path = [tokenAddress, WMATIC_TOKEN, tokenAddress];
        const data = abi.simpleEncode(
          'swapTokensForExactETH(uint256,uint256,address[]):(uint256[])',
          buyAmt,
          value,
          path
        );
        await this.token.transfer(this.proxy.address, value, {
          from: providerAddress,
        });
        await this.proxy.updateTokenMock(this.token.address);
        await expectRevert(
          this.proxy.execMock(to, data, { from: user }),
          'HQuickSwap_swapTokensForExactETH: UniswapV2Router: INVALID_PATH'
        );
      });

      it('matic token', async function() {
        const value = ether('1');
        const buyAmt = ether('1');
        const to = this.hQuickSwap.address;
        const path = [MATIC_TOKEN, WMATIC_TOKEN];
        const data = abi.simpleEncode(
          'swapTokensForExactETH(uint256,uint256,address[]):(uint256[])',
          buyAmt,
          value,
          path
        );
        await expectRevert(
          this.proxy.execMock(to, data, { from: user }),
          'Not support matic token'
        );
      });
    });
  });

  describe('Token to Token', function() {
    const token0Address = WETH_TOKEN;
    const token1Address = USDC_TOKEN;

    let token0User;
    let token1User;
    let providerAddress;

    before(async function() {
      providerAddress = await tokenProviderSushi(token0Address);

      this.token0 = await IToken.at(token0Address);
      this.token1 = await IToken.at(token1Address);
    });

    beforeEach(async function() {
      token0User = await this.token0.balanceOf(user);
      token1User = await this.token1.balanceOf(user);
    });

    describe('Exact input', function() {
      it('normal', async function() {
        const value = ether('1');
        const to = this.hQuickSwap.address;
        const path = [token0Address, WMATIC_TOKEN, token1Address];
        const result = await this.router.getAmountsOut(value, path, {
          from: someone,
        });
        const data = abi.simpleEncode(
          'swapExactTokensForTokens(uint256,uint256,address[]):(uint256[])',
          value,
          mulPercent(result, new BN('100').sub(slippage)),
          path
        );
        await this.token0.transfer(this.proxy.address, value, {
          from: providerAddress,
        });
        await this.proxy.updateTokenMock(this.token0.address);
        await this.token0.transfer(someone, value, {
          from: providerAddress,
        });
        const receipt = await this.proxy.execMock(to, data, { from: user });
        const handlerReturn = utils.toBN(
          getHandlerReturn(receipt, ['uint256'])[0]
        );
        expect(handlerReturn).to.be.bignumber.eq(result[result.length - 1]);
        expect(await this.token0.balanceOf(user)).to.be.bignumber.eq(
          token0User
        );
        expect(
          await this.token0.balanceOf(this.proxy.address)
        ).to.be.bignumber.eq(ether('0'));
        expect(
          await this.token1.balanceOf(this.proxy.address)
        ).to.be.bignumber.eq(ether('0'));
        expect(await this.token1.balanceOf(user)).to.be.bignumber.eq(
          token1User.add(result[result.length - 1])
        );
        profileGas(receipt);
      });

      it('max amount', async function() {
        const value = ether('1');
        const to = this.hQuickSwap.address;
        const path = [token0Address, WMATIC_TOKEN, token1Address];
        const result = await this.router.getAmountsOut(value, path, {
          from: someone,
        });
        const data = abi.simpleEncode(
          'swapExactTokensForTokens(uint256,uint256,address[]):(uint256[])',
          MAX_UINT256,
          mulPercent(result, new BN('100').sub(slippage)),
          path
        );
        await this.token0.transfer(this.proxy.address, value, {
          from: providerAddress,
        });
        await this.proxy.updateTokenMock(this.token0.address);
        await this.token0.transfer(someone, value, {
          from: providerAddress,
        });
        const receipt = await this.proxy.execMock(to, data, { from: user });
        const handlerReturn = utils.toBN(
          getHandlerReturn(receipt, ['uint256'])[0]
        );
        expect(handlerReturn).to.be.bignumber.eq(result[result.length - 1]);
        expect(await this.token0.balanceOf(user)).to.be.bignumber.eq(
          token0User
        );
        expect(
          await this.token0.balanceOf(this.proxy.address)
        ).to.be.bignumber.eq(ether('0'));
        expect(
          await this.token1.balanceOf(this.proxy.address)
        ).to.be.bignumber.eq(ether('0'));
        expect(await this.token1.balanceOf(user)).to.be.bignumber.eq(
          token1User.add(result[result.length - 1])
        );
        profileGas(receipt);
      });

      it('min output too high', async function() {
        const value = ether('1');
        const to = this.hQuickSwap.address;
        const path = [token0Address, WMATIC_TOKEN, token1Address];
        await this.token0.transfer(this.proxy.address, value, {
          from: providerAddress,
        });
        await this.proxy.updateTokenMock(this.token0.address);
        await this.token0.transfer(someone, value, {
          from: providerAddress,
        });
        const result = await this.router.getAmountsOut(value, path, {
          from: someone,
        });
        const data = abi.simpleEncode(
          'swapExactTokensForTokens(uint256,uint256,address[]):(uint256[])',
          value,
          result[result.length - 1].add(ether('10')),
          path
        );
        await expectRevert(
          this.proxy.execMock(to, data, { from: user }),
          'HQuickSwap_swapExactTokensForTokens: UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT'
        );
      });
      it('identical addresses', async function() {
        const value = ether('1');
        const to = this.hQuickSwap.address;
        const path = [token0Address, token0Address, token1Address];
        const data = abi.simpleEncode(
          'swapExactTokensForTokens(uint256,uint256,address[]):(uint256[])',
          value,
          new BN('1'),
          path
        );
        await this.token0.transfer(this.proxy.address, value, {
          from: providerAddress,
        });
        await this.proxy.updateTokenMock(this.token0.address);
        await expectRevert(
          this.proxy.execMock(to, data, { from: user }),
          'HQuickSwap_swapExactTokensForTokens: UniswapV2Library: IDENTICAL_ADDRESSES'
        );
      });

      it('from matic token', async function() {
        const value = ether('1');
        const to = this.hQuickSwap.address;
        const path = [MATIC_TOKEN, WMATIC_TOKEN, token1Address];
        const data = abi.simpleEncode(
          'swapExactTokensForTokens(uint256,uint256,address[]):(uint256[])',
          value,
          new BN('1'),
          path
        );
        await expectRevert(
          this.proxy.execMock(to, data, { from: user }),
          'Not support matic token'
        );
      });

      it('to matic token', async function() {
        const value = ether('1');
        const to = this.hQuickSwap.address;
        const path = [token0Address, WMATIC_TOKEN, MATIC_TOKEN];
        const data = abi.simpleEncode(
          'swapExactTokensForTokens(uint256,uint256,address[]):(uint256[])',
          value,
          new BN('1'),
          path
        );
        await expectRevert(
          this.proxy.execMock(to, data, { from: user }),
          'HQuickSwap_swapExactTokensForTokens: Unspecified'
        );
      });
    });

    describe('Exact output', function() {
      it('normal', async function() {
        const value = ether('1');
        const buyAmt = decimal6('1');
        const to = this.hQuickSwap.address;
        const path = [token0Address, WMATIC_TOKEN, token1Address];
        const result = await this.router.getAmountsIn(buyAmt, path, {
          from: someone,
        });
        const data = abi.simpleEncode(
          'swapTokensForExactTokens(uint256,uint256,address[]):(uint256[])',
          buyAmt,
          mulPercent(result[0], new BN('100').add(slippage)),
          path
        );
        await this.token0.transfer(this.proxy.address, value, {
          from: providerAddress,
        });
        await this.proxy.updateTokenMock(this.token0.address);
        await this.token0.transfer(someone, value, {
          from: providerAddress,
        });
        const receipt = await this.proxy.execMock(to, data, {
          from: user,
        });

        const handlerReturn = utils.toBN(
          getHandlerReturn(receipt, ['uint256'])[0]
        );
        expect(handlerReturn).to.be.bignumber.eq(result[0]);

        expect(await this.token0.balanceOf(user)).to.be.bignumber.eq(
          token0User.add(value).sub(result[0])
        );
        expect(
          await this.token0.balanceOf(this.proxy.address)
        ).to.be.bignumber.eq(ether('0'));
        expect(
          await this.token1.balanceOf(this.proxy.address)
        ).to.be.bignumber.eq(ether('0'));
        expect(await this.token1.balanceOf(user)).to.be.bignumber.eq(
          token1User.add(buyAmt)
        );
        profileGas(receipt);
      });

      it('max amount', async function() {
        const value = ether('1');
        const buyAmt = decimal6('1');
        const to = this.hQuickSwap.address;
        const path = [token0Address, WMATIC_TOKEN, token1Address];
        const result = await this.router.getAmountsIn(buyAmt, path, {
          from: someone,
        });
        const data = abi.simpleEncode(
          'swapTokensForExactTokens(uint256,uint256,address[]):(uint256[])',
          buyAmt,
          MAX_UINT256,
          path
        );
        await this.token0.transfer(this.proxy.address, value, {
          from: providerAddress,
        });
        await this.proxy.updateTokenMock(this.token0.address);
        await this.token0.transfer(someone, value, {
          from: providerAddress,
        });
        const receipt = await this.proxy.execMock(to, data, {
          from: user,
        });

        const handlerReturn = utils.toBN(
          getHandlerReturn(receipt, ['uint256'])[0]
        );
        expect(handlerReturn).to.be.bignumber.eq(result[0]);

        expect(await this.token0.balanceOf(user)).to.be.bignumber.eq(
          token0User.add(value).sub(result[0])
        );
        expect(
          await this.token0.balanceOf(this.proxy.address)
        ).to.be.bignumber.eq(ether('0'));
        expect(
          await this.token1.balanceOf(this.proxy.address)
        ).to.be.bignumber.eq(ether('0'));
        expect(await this.token1.balanceOf(user)).to.be.bignumber.eq(
          token1User.add(buyAmt)
        );
        profileGas(receipt);
      });

      it('excessive input amount', async function() {
        const value = ether('1');
        const buyAmt = decimal6('100000');
        const to = this.hQuickSwap.address;
        const path = [token0Address, WMATIC_TOKEN, token1Address];
        const data = abi.simpleEncode(
          'swapTokensForExactTokens(uint256,uint256,address[]):(uint256[])',
          buyAmt,
          value,
          path
        );
        await this.token0.transfer(this.proxy.address, value, {
          from: providerAddress,
        });
        await this.proxy.updateTokenMock(this.token0.address);
        await expectRevert(
          this.proxy.execMock(to, data, { from: user }),
          'HQuickSwap_swapTokensForExactTokens: UniswapV2Router: EXCESSIVE_INPUT_AMOUNT'
        );
      });

      it('identical addresses', async function() {
        const value = ether('1');
        const buyAmt = decimal6('1');
        const to = this.hQuickSwap.address;
        const path = [token0Address, WMATIC_TOKEN, WMATIC_TOKEN, token1Address];
        const data = abi.simpleEncode(
          'swapTokensForExactTokens(uint256,uint256,address[]):(uint256[])',
          buyAmt,
          value,
          path
        );
        await this.token0.transfer(this.proxy.address, value, {
          from: providerAddress,
        });
        await this.proxy.updateTokenMock(this.token0.address);
        await expectRevert(
          this.proxy.execMock(to, data, { from: user }),
          'HQuickSwap_swapTokensForExactTokens: UniswapV2Library: IDENTICAL_ADDRESSES'
        );
      });

      it('from matic token', async function() {
        const value = ether('1');
        const buyAmt = decimal6('1');
        const to = this.hQuickSwap.address;
        const path = [MATIC_TOKEN, WMATIC_TOKEN, token1Address];
        const data = abi.simpleEncode(
          'swapTokensForExactTokens(uint256,uint256,address[]):(uint256[])',
          buyAmt,
          new BN('1'),
          path
        );
        await expectRevert(
          this.proxy.execMock(to, data, {
            from: user,
          }),
          'Not support matic token'
        );
      });

      it('to matic token', async function() {
        const value = ether('1');
        const buyAmt = decimal6('1');
        const to = this.hQuickSwap.address;
        const path = [token0Address, WMATIC_TOKEN, MATIC_TOKEN];
        const data = abi.simpleEncode(
          'swapTokensForExactTokens(uint256,uint256,address[]):(uint256[])',
          buyAmt,
          new BN('1'),
          path
        );
        await expectRevert(
          this.proxy.execMock(to, data, {
            from: user,
          }),
          'HQuickSwap_swapTokensForExactTokens: Unspecified'
        );
      });
    });
  });
});
