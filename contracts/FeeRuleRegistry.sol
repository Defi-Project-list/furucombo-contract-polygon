pragma solidity 0.8.10;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interface/IFeeRuleRegistry.sol";
import "./interface/IRule.sol";

contract FeeRuleRegistry is IFeeRuleRegistry, Ownable {
    mapping(uint256 => address) public override rules;

    uint256 public override counter;
    uint256 public override basisFeeRate;
    address public override feeCollector;
    uint256 public constant override BASE = 1e18;

    event RegisteredRule(uint256 index, address rule);
    event UnregisteredRule(uint256 index);
    event SetBasisFeeRate(uint256 basisFeeRate);
    event SetFeeCollector(address feeCollector);

    constructor(uint256 _basisFeeRate, address _feeCollector) {
        if (_basisFeeRate != 0) setBasisFeeRate(_basisFeeRate);
        setFeeCollector(_feeCollector);
    }

    function setBasisFeeRate(uint256 _basisFeeRate) public override onlyOwner {
        require(_basisFeeRate <= BASE, "Out of range");
        require(_basisFeeRate != basisFeeRate, "Same as current one");
        basisFeeRate = _basisFeeRate;
        emit SetBasisFeeRate(basisFeeRate);
    }

    function setFeeCollector(address _feeCollector) public override onlyOwner {
        require(_feeCollector != address(0), "Zero address");
        require(_feeCollector != feeCollector, "Same as current one");
        feeCollector = _feeCollector;
        emit SetFeeCollector(feeCollector);
    }

    function registerRule(address _rule) external override onlyOwner {
        require(_rule != address(0), "Not allow to register zero address");
        rules[counter] = _rule;
        emit RegisteredRule(counter, _rule);
        counter = counter + 1;
    }

    function unregisterRule(uint256 _ruleIndex) external override onlyOwner {
        require(
            rules[_ruleIndex] != address(0),
            "Rule not set or unregistered"
        );
        rules[_ruleIndex] = address(0);
        emit UnregisteredRule(_ruleIndex);
    }

    function calFeeRateMulti(address _usr, uint256[] calldata _ruleIndexes)
        external
        view
        override
        returns (uint256 scaledRate)
    {
        scaledRate =
            (calFeeRateMultiWithoutBasis(_usr, _ruleIndexes) * basisFeeRate) /
            BASE;
    }

    function calFeeRateMultiWithoutBasis(
        address _usr,
        uint256[] calldata _ruleIndexes
    ) public view override returns (uint256 scaledRate) {
        uint256 len = _ruleIndexes.length;
        if (len == 0) {
            scaledRate = BASE;
        } else {
            scaledRate = _calDiscount(_usr, rules[_ruleIndexes[0]]);
            for (uint256 i = 1; i < len; i++) {
                require(
                    _ruleIndexes[i] > _ruleIndexes[i - 1],
                    "Not ascending order"
                );

                scaledRate =
                    (scaledRate * _calDiscount(_usr, rules[_ruleIndexes[i]])) /
                    BASE;
            }
        }
    }

    function calFeeRate(address _usr, uint256 _ruleIndex)
        external
        view
        override
        returns (uint256 scaledRate)
    {
        scaledRate =
            (calFeeRateWithoutBasis(_usr, _ruleIndex) * basisFeeRate) /
            BASE;
    }

    function calFeeRateWithoutBasis(address _usr, uint256 _ruleIndex)
        public
        view
        override
        returns (uint256 scaledRate)
    {
        scaledRate = _calDiscount(_usr, rules[_ruleIndex]);
    }

    /* Internal Functions */
    function _calDiscount(address _usr, address _rule)
        internal
        view
        returns (uint256 discount)
    {
        if (_rule != address(0)) {
            discount = IRule(_rule).calDiscount(_usr);
            require(discount <= BASE, "Discount out of range");
        } else {
            discount = BASE;
        }
    }
}
