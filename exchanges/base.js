const Utils = require('./../utils');
// const bUtils = require('./../../utils');
const Event = require('bcore/event');
const _ = require('lodash');
// const config = require('./../config');
const deepmerge = require('deepmerge');
const argv = require('optimist').argv;
const fs = require('fs');
const path = require('path');

const { delay } = Utils;

const defaultOptions = {
  timeout: 10000,
};

const isProxy = !!argv.proxy;

class exchange extends Event {
  constructor(config = {}, options = {}) {
    super();
    const { apiKey, apiSecret, unique_id, otc_id, spot_id } = config;
    this.config = config;
    this.options = deepmerge(defaultOptions, options);
    this.apiSecret = apiSecret;
    this.apiKey = apiKey;
    this.otc_id = otc_id;
    this.spot_id = spot_id;
    this.unique_id = unique_id;
    this.proxy = isProxy ? 'http://127.0.0.1:1087' : null;
  }
  // io
  getApiKey() {
    return this.apiKey;
  }
  // 工具函数
  print(str, color = 'yellow') {
    str = `${this.name}: ${str}`;
    return Utils.print(str, color);
  }
  warn(str, e) {
    console.log(e);
    this.print(str, 'red');
  }
  warnExit(str, e) {
    this.warn(str, e);
    process.exit();
  }
  // 锁机制
  _getLockName(side, coin = '') {
    return `${side}${coin}Lock`;
  }
  isLock(side, coin = '') {
    const lock = this._getLockName(side, coin);
    return !!this[lock];
  }
  addLock(side, coin = '') {
    const lock = this._getLockName(side, coin);
    this[lock] = true;
  }
  cancelLock(side, coin = '') {
    const lock = this._getLockName(side, coin);
    this[lock] = false;
  }
  // CURD
  async get(endpoint, params, isSign) {
    return await this.request('GET', endpoint, params, isSign);
  }
  async post(endpoint, params, isSign) {
    return await this.request('POST', endpoint, params, isSign);
  }
  async delete(endpoint, params, isSign) {
    return await this.request('DELETE', endpoint, params, isSign);
  }
  // 保存配置
  _getConifgPath(file, ext = 'json') {
    return path.join(__dirname, `./${this.name}/meta/${file}.json`);
  }
  saveConfig(json = {}, file) {
    const pth = this._getConifgPath(file);
    const str = JSON.stringify(json, null, 2);
    fs.writeFileSync(pth, str, 'utf8');
  }
  readConfig(file) {
    const pth = this._getConifgPath(file);
    const text = fs.readFileSync(pth, 'utf8');
    return JSON.parse(text);
  }
  // 别名 alias
  async candlestick(o) { // 与kline意义一致
    return await this.kline(o);
  }

  // 函数包装
  _getWrapConfig(config = {}) {
    let defaultConfig;
    try {
      defaultConfig = this.readConfig('api');
    } catch (e) {
      this.warnExit('可能未配置wrap (exchange/meta/api.json)', e);
    }
    return { ...defaultConfig, ...config };
  }
  genRateLimitFn(fn, t = 100, fnName) {
    const lockName = `rate_limit_${fnName}`;
    return async (a, b, c, d) => {
      let ds = false;
      if (this.isLock(lockName)) {
        await delay(t);
        this.cancelLock(lockName);
      }
      this.addLock(lockName);
      try {
        ds = await fn(a, b, c, d);
      } catch (e) {
        this.warn(`${fnName} error`, e);
      }
      return ds;
    };
  }
  wrap(config = {}, o = {}) {
    const { isPrint = false } = o;
    config = this._getWrapConfig(config);
    _.forEach(config, (conf, fnName) => {
      let fn = this[fnName];
      if (!fn) this.warnExit(`不存在函数${fnName}`);
      fn = fn.bind(this);
      if (conf.timeout || conf.retry) fn = Utils.wrapFn(fn, conf, isPrint, fnName);
      if (conf.rateLimit) fn = this.genRateLimitFn(fn, conf.rateLimit, fnName);
      this[fnName] = fn;
    });
    return true;
  }
}

module.exports = exchange;
