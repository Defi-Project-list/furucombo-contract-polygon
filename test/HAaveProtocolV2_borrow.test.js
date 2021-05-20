const {
  balance,
  BN,
  constants,
  ether,
  expectEvent,
  expectRevert,
  time,
} = require('@openzeppelin/test-helpers');
const { MAX_UINT256 } = constants;
const { tracker } = balance;
const { latest } = time;
const abi = require('ethereumjs-abi');
const util = require('ethereumjs-util');
const utils = web3.utils;

const { expect } = require('chai');

const {
  WMATIC_TOKEN,
  WMATIC_PROVIDER,
  DAI_TOKEN,
  DAI_PROVIDER,
  WETH_TOKEN,
  COMP_TOKEN,
  ADAI_V2,
  AWMATIC_V2,
  AAVEPROTOCOL_V2_PROVIDER,
  AWMATIC_V2_DEBT_STABLE,
  AWMATIC_V2_DEBT_VARIABLE,
  AWETH_V2_DEBT_STABLE,
  AWETH_V2_DEBT_VARIABLE,
  AAVE_RATEMODE,
} = require('./utils/constants');
const {
  evmRevert,
  evmSnapshot,
  profileGas,
  getHandlerReturn,
  mulPercent,
} = require('./utils/utils');

const HAaveV2 = artifacts.require('HAaveProtocolV2');
const Registry = artifacts.require('Registry');
const Proxy = artifacts.require('ProxyMock');
const IToken = artifacts.require('IERC20');
const IAToken = artifacts.require('IATokenV2');
const ILendingPool = artifacts.require('ILendingPoolV2');
const IProvider = artifacts.require('ILendingPoolAddressesProviderV2');
const SimpleToken = artifacts.require('SimpleToken');

const IStableDebtToken = artifacts.require('IStableDebtToken');
const IVariableDebtToken = artifacts.require('IVariableDebtToken');

contract('Aave V2', function([_, user, someone]) {
  const aTokenAddress = ADAI_V2;
  const tokenAddress = DAI_TOKEN;
  const providerAddress = DAI_PROVIDER;

  let id;
  let balanceUser;
  let balanceProxy;

  before(async function() {
    this.registry = await Registry.new();
    this.proxy = await Proxy.new(this.registry.address);
    this.hAaveV2 = await HAaveV2.new();
    await this.registry.register(
      this.hAaveV2.address,
      utils.asciiToHex('AaveProtocolV2')
    );
    this.provider = await IProvider.at(AAVEPROTOCOL_V2_PROVIDER);
    this.lendingPoolAddress = await this.provider.getLendingPool.call();
    this.lendingPool = await ILendingPool.at(this.lendingPoolAddress);
    this.token = await IToken.at(tokenAddress);
    this.aToken = await IAToken.at(aTokenAddress);
    this.wmatic = await IToken.at(WMATIC_TOKEN);
    this.mockToken = await SimpleToken.new();
  });

  beforeEach(async function() {
    id = await evmSnapshot();
    balanceUser = await tracker(user);
    balanceProxy = await tracker(this.proxy.address);
  });

  afterEach(async function() {
    await evmRevert(id);
  });

  /** Stable Rate borrow is not available yet
  describe('Borrow with Stable Rate', function() {
    const depositAmount = ether('10000');
    const borrowTokenAddr = WETH_TOKEN;
    const rateMode = AAVE_RATEMODE.STABLE;
    const debtTokenAddr = AWETH_V2_DEBT_STABLE;
    const debtWMATICAddr = AWMATIC_V2_DEBT_STABLE;

    let borrowTokenUserBefore;
    let debtTokenUserBefore;
    let debtWMATICUserBefore;

    before(async function() {
      this.borrowToken = await IToken.at(borrowTokenAddr);
      this.wmatic = await IToken.at(WMATIC_TOKEN);
      this.debtWMATIC = await IStableDebtToken.at(debtWMATICAddr);
      this.debtToken = await IStableDebtToken.at(debtTokenAddr);
    });

    beforeEach(async function() {
      // Deposit
      await this.token.approve(this.lendingPool.address, depositAmount, {
        from: providerAddress,
      });
      expect(await this.aToken.balanceOf.call(user)).to.be.zero;
      await this.lendingPool.deposit(
        this.token.address,
        depositAmount,
        user,
        0,
        { from: providerAddress }
      );
      expect(await this.aToken.balanceOf.call(user)).to.be.bignumber.eq(
        depositAmount
      );

      borrowTokenUserBefore = await this.borrowToken.balanceOf.call(user);
      borrowWMATICUserBefore = await this.wmatic.balanceOf.call(user);
      debtTokenUserBefore = await this.debtToken.balanceOf.call(user);
      debtWMATICUserBefore = await this.debtWMATIC.balanceOf.call(user);
    });

    it('borrow token', async function() {
      const borrowAmount = ether('1');
      const to = this.hAaveV2.address;
      const data = abi.simpleEncode(
        'borrow(address,uint256,uint256)',
        this.borrowToken.address,
        borrowAmount,
        rateMode
      );
      await this.debtToken.approveDelegation(this.proxy.address, borrowAmount, {
        from: user,
      });
      await balanceUser.get();
      const receipt = await this.proxy.execMock(to, data, {
        from: user,
        value: ether('0.1'),
      });
      const borrowTokenUserAfter = await this.borrowToken.balanceOf.call(user);
      const debtTokenUserAfter = await this.debtToken.balanceOf.call(user);
      // Verify proxy balance
      expect(await balanceProxy.get()).to.be.zero;
      expect(
        await this.borrowToken.balanceOf.call(this.proxy.address)
      ).to.be.zero;
      expect(
        await this.debtToken.balanceOf.call(this.proxy.address)
      ).to.be.zero;

      // Verify user balance
      expect(
        borrowTokenUserAfter.sub(borrowTokenUserBefore)
      ).to.be.bignumber.eq(borrowAmount);

      //  borrowAmount <= (debtTokenUserAfter-debtTokenUserBefore) < borrowAmount + interestMax
      const interestMax = borrowAmount.mul(new BN(1)).div(new BN(10000));
      expect(debtTokenUserAfter.sub(debtTokenUserBefore)).to.be.bignumber.gte(
        borrowAmount
      );
      expect(debtTokenUserAfter.sub(debtTokenUserBefore)).to.be.bignumber.lt(
        borrowAmount.add(interestMax)
      );
      profileGas(receipt);
    });

    it('borrow wmatic', async function() {
      const borrowAmount = ether('2');
      const to = this.hAaveV2.address;
      const data = abi.simpleEncode(
        'borrow(address,uint256,uint256)',
        WMATIC_TOKEN,
        borrowAmount,
        rateMode
      );

      await this.debtWMATIC.approveDelegation(
        this.proxy.address,
        borrowAmount,
        {
          from: user,
        }
      );
      await balanceUser.get();
      const receipt = await this.proxy.execMock(to, data, {
        from: user,
        value: ether('0.1'),
      });
      const borrowWMATICUserAfter = await this.wmatic.balanceOf.call(user);
      const debtWMATICUserAfter = await this.debtWMATIC.balanceOf.call(user);
      // Verify proxy balance
      expect(await balanceProxy.get()).to.be.zero;
      expect(
        await this.borrowToken.balanceOf.call(this.proxy.address)
      ).to.be.zero;
      expect(
        await this.debtToken.balanceOf.call(this.proxy.address)
      ).to.be.zero;

      // Verify user balance
      expect(
        borrowWMATICUserAfter.sub(borrowWMATICUserBefore)
      ).to.be.bignumber.eq(borrowAmount);

      //  borrowAmount <= (debtTokenUserAfter-debtTokenUserBefore) < borrowAmount + interestMax
      const interestMax = borrowAmount.mul(new BN(1)).div(new BN(10000));
      expect(debtWMATICUserAfter.sub(debtWMATICUserBefore)).to.be.bignumber.gte(
        borrowAmount
      );
      expect(debtWMATICUserAfter.sub(debtWMATICUserBefore)).to.be.bignumber.lt(
        borrowAmount.add(interestMax)
      );
      profileGas(receipt);
    });

    it('borrow matic', async function() {
      const borrowAmount = ether('2');
      const to = this.hAaveV2.address;
      const data = abi.simpleEncode(
        'borrowETH(uint256,uint256)',
        borrowAmount,
        rateMode
      );
      await this.debtWMATIC.approveDelegation(
        this.proxy.address,
        borrowAmount,
        {
          from: user,
        }
      );
      const balancerUserBefore = await balanceUser.get();
      const receipt = await this.proxy.execMock(to, data, {
        from: user,
        value: ether('0.1'),
      });

      const balancerUserAfter = await balanceUser.get();
      const debtWMATICUserAfter = await this.debtWMATIC.balanceOf.call(user);
      // Verify proxy balance
      expect(await balanceProxy.get()).to.be.zero;
      expect(
        await this.debtToken.balanceOf.call(this.proxy.address)
      ).to.be.zero;

      // Verify user balance
      expect(balancerUserAfter.sub(balancerUserBefore)).to.be.bignumber.eq(
        borrowAmount.sub(new BN(receipt.receipt.gasUsed))
      );
      //  borrowAmount <= (debtTokenUserAfter-debtTokenUserBefore) < borrowAmount + interestMax
      const interestMax = borrowAmount.mul(new BN(1)).div(new BN(10000));
      expect(debtWMATICUserAfter.sub(debtWMATICUserBefore)).to.be.bignumber.gte(
        borrowAmount
      );
      expect(debtWMATICUserAfter.sub(debtWMATICUserBefore)).to.be.bignumber.lt(
        borrowAmount.add(interestMax)
      );
      profileGas(receipt);
    });

    it('should revert: borrow token over the collateral value', async function() {
      const borrowAmount = ether('20000');
      const to = this.hAaveV2.address;
      const data = abi.simpleEncode(
        'borrow(address,uint256,uint256)',
        this.borrowToken.address,
        borrowAmount,
        rateMode
      );
      await this.debtWMATIC.approveDelegation(
        this.proxy.address,
        borrowAmount,
        {
          from: user,
        }
      );

      await expectRevert(
        this.proxy.execMock(to, data, { from: user, value: ether('0.1') }),
        'HAaveProtocolV2_borrow: 11' // AAVEV2 Error Code: VL_COLLATERAL_CANNOT_COVER_NEW_BORROW
      );
    });

    it('should revert: borrow token without approveDelegation', async function() {
      const borrowAmount = ether('2');
      const to = this.hAaveV2.address;
      const data = abi.simpleEncode(
        'borrow(address,uint256,uint256)',
        this.borrowToken.address,
        borrowAmount,
        rateMode
      );

      await expectRevert(
        this.proxy.execMock(to, data, { from: user }),
        'HAaveProtocolV2_borrow: 59' // AAVEV2 Error Code: BORROW_ALLOWANCE_NOT_ENOUGH
      );
    });

    it('should revert: borrow token approveDelegation < borrow amount', async function() {
      const borrowAmount = ether('2');
      const to = this.hAaveV2.address;
      const data = abi.simpleEncode(
        'borrow(address,uint256,uint256)',
        this.borrowToken.address,
        borrowAmount,
        rateMode
      );

      await this.debtToken.approveDelegation(
        this.proxy.address,
        borrowAmount.sub(ether('1')),
        {
          from: user,
        }
      );

      await expectRevert(
        this.proxy.execMock(to, data, { from: user }),
        'HAaveProtocolV2_borrow: 59' // AAVEV2 Error Code: BORROW_ALLOWANCE_NOT_ENOUGH
      );
    });

    it('should revert: borrow token that is not in aaveV2 pool', async function() {
      const borrowAmount = ether('2');
      const to = this.hAaveV2.address;
      const data = abi.simpleEncode(
        'borrow(address,uint256,uint256)',
        COMP_TOKEN,
        borrowAmount,
        rateMode
      );

      await expectRevert(
        this.proxy.execMock(to, data, { from: user }),
        'HAaveProtocolV2_borrow: 2' // AAVEV2 Error Code: VL_NO_ACTIVE_RESERVE
      );
    });

    it('should revert: borrow token with no collateral ', async function() {
      const borrowAmount = ether('2');
      const to = this.hAaveV2.address;
      const data = abi.simpleEncode(
        'borrow(address,uint256,uint256)',
        this.borrowToken.address,
        borrowAmount,
        rateMode
      );

      await expectRevert(
        this.proxy.execMock(to, data, { from: someone }),
        'HAaveProtocolV2_borrow: 9' // AAVEV2 Error Code: VL_COLLATERAL_BALANCE_IS_0
      );
    });

    it('should revert: borrow token is the same with collateral', async function() {
      const borrowAmount = ether('2');
      const to = this.hAaveV2.address;
      const data = abi.simpleEncode(
        'borrow(address,uint256,uint256)',
        this.token.address,
        borrowAmount,
        rateMode
      );

      await expectRevert(
        this.proxy.execMock(to, data, { from: user }),
        'HAaveProtocolV2_borrow: 13' // AAVEV2 Error Code: VL_COLLATERAL_SAME_AS_BORROWING_CURRENCY
      );
    });
  });
*/

  describe('Borrow with Variable Rate', function() {
    const depositAmount = ether('10000');
    const borrowTokenAddr = WETH_TOKEN;
    const rateMode = AAVE_RATEMODE.VARIABLE;
    const debtTokenAddr = AWETH_V2_DEBT_VARIABLE;
    const debtWMATICAddr = AWMATIC_V2_DEBT_VARIABLE;

    let borrowTokenUserBefore;
    let debtTokenUserBefore;
    let debtWMATICUserBefore;

    before(async function() {
      this.borrowToken = await IToken.at(borrowTokenAddr);
      this.wmatic = await IToken.at(WMATIC_TOKEN);
      this.debtWMATIC = await IVariableDebtToken.at(debtWMATICAddr);
      this.debtToken = await IVariableDebtToken.at(debtTokenAddr);
    });

    beforeEach(async function() {
      // Deposit
      await this.token.approve(this.lendingPool.address, depositAmount, {
        from: providerAddress,
      });

      expect(await this.aToken.balanceOf.call(user)).to.be.zero;
      await this.lendingPool.deposit(
        this.token.address,
        depositAmount,
        user,
        0,
        { from: providerAddress }
      );
      expect(await this.aToken.balanceOf.call(user)).to.be.bignumber.eq(
        depositAmount
      );

      borrowTokenUserBefore = await this.borrowToken.balanceOf.call(user);
      borrowWMATICUserBefore = await this.wmatic.balanceOf.call(user);
      debtTokenUserBefore = await this.debtToken.balanceOf.call(user);
      debtWMATICUserBefore = await this.debtWMATIC.balanceOf.call(user);
    });

    it('borrow token', async function() {
      const borrowAmount = ether('1');
      const to = this.hAaveV2.address;
      const data = abi.simpleEncode(
        'borrow(address,uint256,uint256)',
        this.borrowToken.address,
        borrowAmount,
        rateMode
      );
      await this.debtToken.approveDelegation(this.proxy.address, borrowAmount, {
        from: user,
      });
      await balanceUser.get();
      const receipt = await this.proxy.execMock(to, data, {
        from: user,
        value: ether('0.1'),
      });
      const borrowTokenUserAfter = await this.borrowToken.balanceOf.call(user);
      const debtTokenUserAfter = await this.debtToken.balanceOf.call(user);
      // Verify proxy balance
      expect(await balanceProxy.get()).to.be.zero;
      expect(
        await this.borrowToken.balanceOf.call(this.proxy.address)
      ).to.be.zero;
      expect(
        await this.debtToken.balanceOf.call(this.proxy.address)
      ).to.be.zero;

      // Verify user balance
      expect(
        borrowTokenUserAfter.sub(borrowTokenUserBefore)
      ).to.be.bignumber.eq(borrowAmount);

      //  borrowAmount <= (debtTokenUserAfter-debtTokenUserBefore) < borrowAmount + interestMax
      const interestMax = borrowAmount.mul(new BN(1)).div(new BN(10000));
      expect(debtTokenUserAfter.sub(debtTokenUserBefore)).to.be.bignumber.gte(
        borrowAmount
      );
      expect(debtTokenUserAfter.sub(debtTokenUserBefore)).to.be.bignumber.lt(
        borrowAmount.add(interestMax)
      );

      profileGas(receipt);
    });

    it('borrow wmatic', async function() {
      const borrowAmount = ether('2');
      const to = this.hAaveV2.address;
      const data = abi.simpleEncode(
        'borrow(address,uint256,uint256)',
        WMATIC_TOKEN,
        borrowAmount,
        rateMode
      );

      await this.debtWMATIC.approveDelegation(
        this.proxy.address,
        borrowAmount,
        {
          from: user,
        }
      );
      await balanceUser.get();
      const receipt = await this.proxy.execMock(to, data, {
        from: user,
        value: ether('0.1'),
      });
      const borrowWMATICUserAfter = await this.wmatic.balanceOf.call(user);
      const debtWMATICUserAfter = await this.debtWMATIC.balanceOf.call(user);
      // Verify proxy balance
      expect(await balanceProxy.get()).to.be.zero;
      expect(
        await this.borrowToken.balanceOf.call(this.proxy.address)
      ).to.be.zero;
      expect(
        await this.debtToken.balanceOf.call(this.proxy.address)
      ).to.be.zero;

      // Verify user balance
      expect(
        borrowWMATICUserAfter.sub(borrowWMATICUserBefore)
      ).to.be.bignumber.eq(borrowAmount);

      //  borrowAmount <= (debtTokenUserAfter-debtTokenUserBefore) < borrowAmount + interestMax
      const interestMax = borrowAmount.mul(new BN(1)).div(new BN(10000));
      expect(debtWMATICUserAfter.sub(debtWMATICUserBefore)).to.be.bignumber.gte(
        borrowAmount
      );
      expect(debtWMATICUserAfter.sub(debtWMATICUserBefore)).to.be.bignumber.lt(
        borrowAmount.add(interestMax)
      );

      profileGas(receipt);
    });

    it('borrow matic', async function() {
      const borrowAmount = ether('2');
      const to = this.hAaveV2.address;
      const data = abi.simpleEncode(
        'borrowETH(uint256,uint256)',
        borrowAmount,
        rateMode
      );
      await this.debtWMATIC.approveDelegation(
        this.proxy.address,
        borrowAmount,
        {
          from: user,
        }
      );
      const balancerUserBefore = await balanceUser.get();
      const receipt = await this.proxy.execMock(to, data, {
        from: user,
        value: ether('0.1'),
      });

      const balancerUserAfter = await balanceUser.get();
      const debtWMATICUserAfter = await this.debtWMATIC.balanceOf.call(user);
      // Verify proxy balance
      expect(await balanceProxy.get()).to.be.zero;
      expect(
        await this.debtToken.balanceOf.call(this.proxy.address)
      ).to.be.zero;

      // Verify user balance
      expect(balancerUserAfter.sub(balancerUserBefore)).to.be.bignumber.eq(
        borrowAmount.sub(new BN(receipt.receipt.gasUsed))
      );

      //  borrowAmount <= (debtTokenUserAfter-debtTokenUserBefore) < borrowAmount + interestMax
      const interestMax = borrowAmount.mul(new BN(1)).div(new BN(10000));
      expect(debtWMATICUserAfter.sub(debtWMATICUserBefore)).to.be.bignumber.gte(
        borrowAmount
      );
      expect(debtWMATICUserAfter.sub(debtWMATICUserBefore)).to.be.bignumber.lt(
        borrowAmount.add(interestMax)
      );
      profileGas(receipt);
    });

    it('should revert: borrow token over the collateral value', async function() {
      const borrowAmount = ether('20000');
      const to = this.hAaveV2.address;
      const data = abi.simpleEncode(
        'borrow(address,uint256,uint256)',
        this.borrowToken.address,
        borrowAmount,
        rateMode
      );
      await this.debtWMATIC.approveDelegation(
        this.proxy.address,
        borrowAmount,
        {
          from: user,
        }
      );

      await expectRevert(
        this.proxy.execMock(to, data, { from: user, value: ether('0.1') }),
        'HAaveProtocolV2_borrow: 11' // AAVEV2 Error Code: VL_COLLATERAL_CANNOT_COVER_NEW_BORROW
      );
    });

    it('should revert: borrow token without approveDelegation', async function() {
      const borrowAmount = ether('0.2');
      const to = this.hAaveV2.address;
      const data = abi.simpleEncode(
        'borrow(address,uint256,uint256)',
        this.borrowToken.address,
        borrowAmount,
        rateMode
      );

      await expectRevert(
        this.proxy.execMock(to, data, { from: user }),
        'HAaveProtocolV2_borrow: 59' // AAVEV2 Error Code: BORROW_ALLOWANCE_NOT_ENOUGH
      );
    });

    it('should revert: borrow token that is not in aaveV2 pool', async function() {
      const borrowAmount = ether('2');
      const to = this.hAaveV2.address;
      const data = abi.simpleEncode(
        'borrow(address,uint256,uint256)',
        COMP_TOKEN,
        borrowAmount,
        rateMode
      );

      await expectRevert(
        this.proxy.execMock(to, data, { from: user }),
        //'HAaveProtocolV2_borrow: 2' // AAVEV2 Error Code: VL_NO_ACTIVE_RESERVE
        'HAaveProtocolV2_borrow: Unspecified' // Polygon version
      );
    });

    it('should revert: borrow token with no collateral', async function() {
      const borrowAmount = ether('2');
      const to = this.hAaveV2.address;
      const data = abi.simpleEncode(
        'borrow(address,uint256,uint256)',
        this.borrowToken.address,
        borrowAmount,
        rateMode
      );

      await expectRevert(
        this.proxy.execMock(to, data, { from: someone }),
        'HAaveProtocolV2_borrow: 9' // AAVEV2 Error Code: VL_COLLATERAL_BALANCE_IS_0
      );
    });

    it('should revert: borrow token is the same with collateral', async function() {
      const borrowAmount = ether('2');
      const to = this.hAaveV2.address;
      const data = abi.simpleEncode(
        'borrow(address,uint256,uint256)',
        this.token.address,
        borrowAmount,
        rateMode
      );

      await this.debtWMATIC.approveDelegation(user, borrowAmount, {
        from: user,
      });

      await expectRevert(
        this.proxy.execMock(to, data, { from: user }),
        'HAaveProtocolV2_borrow: 59' // AAVEV2 Error Code: BORROW_ALLOWANCE_NOT_ENOUGH
        // Variable rate doesn't check collateral and debt
      );
    });
  });
});
