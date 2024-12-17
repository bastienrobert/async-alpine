// src/strategies.ts
function eager(_) {
  return Promise.resolve(true);
}
function event({ component, argument }) {
  return new Promise((resolve) => {
    if (argument) {
      window.addEventListener(argument, () => resolve(), { once: true });
    } else {
      const cb = (e) => {
        if (e.detail.id !== component.id) return;
        window.removeEventListener("async-alpine:load", cb);
        resolve();
      };
      window.addEventListener("async-alpine:load", cb);
    }
  });
}
function idle(_) {
  return new Promise((resolve) => {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(resolve);
    } else {
      setTimeout(resolve, 200);
    }
  });
}
function media({ argument }) {
  return new Promise((resolve) => {
    if (!argument) {
      console.log("Async Alpine: media strategy requires a media query. Treating as 'eager'");
      return resolve();
    }
    const mediaQuery = window.matchMedia(`(${argument})`);
    if (mediaQuery.matches) {
      resolve();
    } else {
      mediaQuery.addEventListener("change", resolve, { once: true });
    }
  });
}
function visible({
  component,
  argument
}) {
  return new Promise((resolve) => {
    const rootMargin = argument || "0px 0px 0px 0px";
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          observer.disconnect();
          resolve();
        }
      },
      { rootMargin }
    );
    observer.observe(component.el);
  });
}
var strategies = {
  eager,
  event,
  idle,
  media,
  visible
};
var strategies_default = strategies;

// src/requirements.ts
async function awaitRequirements(component) {
  const requirements = parseRequirements(component.strategy);
  await generateRequirements(component, requirements);
}
async function generateRequirements(component, requirements) {
  if (requirements.type === "expression") {
    if (requirements.operator === "&&") {
      return Promise.all(
        requirements.parameters.map(
          (param) => generateRequirements(component, param)
        )
      );
    }
    if (requirements.operator === "||") {
      return Promise.any(
        requirements.parameters.map(
          (param) => generateRequirements(component, param)
        )
      );
    }
  }
  if (requirements.type === "method") {
    if (!strategies_default[requirements.method]) {
      return false;
    }
    return strategies_default[requirements.method]({
      component,
      argument: requirements.argument
    });
  }
  return false;
}
function parseRequirements(expression) {
  const tokens = tokenize(expression);
  let ast = parseExpression(tokens);
  if (ast.type === "method") {
    return {
      type: "expression",
      operator: "&&",
      parameters: [ast]
    };
  }
  return ast;
}
function tokenize(expression) {
  const regex = /\s*([()])\s*|\s*(\|\||&&|\|)\s*|\s*((?:[^()&|]+\([^()]+\))|[^()&|]+)\s*/g;
  const tokens = [];
  let match;
  while ((match = regex.exec(expression)) !== null) {
    const [, parenthesis, operator, token] = match;
    if (parenthesis !== void 0) {
      tokens.push({
        type: "parenthesis",
        value: parenthesis
      });
    } else if (operator !== void 0) {
      tokens.push({
        type: "operator",
        // Make operators backwards-compatible with previous versions
        value: operator === "|" ? "&&" : operator
      });
    } else {
      const tokenObj = {
        type: "method",
        method: token.trim()
      };
      if (token.includes("(")) {
        tokenObj.method = token.substring(0, token.indexOf("(")).trim();
        tokenObj.argument = token.substring(
          token.indexOf("(") + 1,
          token.indexOf(")")
        );
      }
      if (tokenObj.method === "immediate") {
        tokenObj.method = "eager";
      }
      tokens.push(tokenObj);
    }
  }
  return tokens;
}
function parseExpression(tokens) {
  let ast = parseTerm(tokens);
  while (tokens.length > 0 && tokens[0].type === "operator" && (tokens[0].value === "&&" || tokens[0].value === "|" || tokens[0].value === "||")) {
    const operator = tokens.shift().value;
    const right = parseTerm(tokens);
    if (ast.type === "expression" && ast.operator === operator) {
      ast.parameters.push(right);
    } else {
      ast = {
        type: "expression",
        operator,
        parameters: [ast, right]
      };
    }
  }
  return ast;
}
function parseTerm(tokens) {
  if (tokens[0].type === "parenthesis" && tokens[0].value === "(") {
    tokens.shift();
    const ast = parseExpression(tokens);
    if (tokens[0] && tokens[0].type === "parenthesis" && tokens[0].value === ")") {
      tokens.shift();
    }
    return ast;
  } else {
    return tokens.shift();
  }
}

// src/async-alpine.ts
function async_alpine_default(Alpine) {
  const directive = "load";
  const srcAttr = Alpine.prefixed("load-src");
  const ignoreAttr = Alpine.prefixed("ignore");
  let options = {
    defaultStrategy: "eager",
    keepRelativeURLs: false
  };
  let alias = null;
  const data = {};
  let realIndex = 0;
  function index() {
    return realIndex++;
  }
  Alpine.asyncOptions = (opts) => {
    options = {
      ...options,
      ...opts
    };
  };
  Alpine.asyncData = (name, download2) => {
    data[name] = {
      loaded: false,
      download: download2
    };
  };
  Alpine.asyncUrl = (name, url) => {
    if (!name || !url || data[name]) return;
    data[name] = {
      loaded: false,
      download: () => import(
        /* @vite-ignore */
        /* webpackIgnore: true */
        parseUrl(url)
      )
    };
  };
  Alpine.asyncAlias = (path) => {
    alias = path;
  };
  const syncHandler = (el) => {
    Alpine.skipDuringClone(() => {
      if (el._x_async) return;
      el._x_async = "init";
      el._x_ignore = true;
      el.setAttribute(ignoreAttr, "");
    })();
  };
  const handler = async (el) => {
    Alpine.skipDuringClone(async () => {
      if (el._x_async !== "init") return;
      el._x_async = "await";
      const { name, strategy } = elementPrep(el);
      await awaitRequirements({
        name,
        strategy,
        el,
        id: el.id || index().toString()
      });
      await download(name);
      activate(el);
      el._x_async = "loaded";
    })();
  };
  handler.inline = syncHandler;
  Alpine.directive(directive, handler).before("ignore");
  function elementPrep(el) {
    const name = parseName(el.getAttribute(Alpine.prefixed("data")));
    const strategy = el.getAttribute(Alpine.prefixed(directive)) || options.defaultStrategy;
    const urlAttributeValue = el.getAttribute(srcAttr);
    if (urlAttributeValue) {
      Alpine.asyncUrl(name, urlAttributeValue);
    }
    return {
      name,
      strategy
    };
  }
  async function download(name) {
    if (name.startsWith("_x_async_")) return;
    handleAlias(name);
    if (!data[name] || data[name].loaded) return;
    const module = await getModule(name);
    Alpine.data(name, module);
    data[name].loaded = true;
  }
  async function getModule(name) {
    if (!data[name]) return;
    const module = await data[name].download(name);
    if (typeof module === "function") return module;
    let whichExport = module[name] || module.default || Object.values(module)[0] || false;
    return whichExport;
  }
  function activate(el) {
    Alpine.destroyTree(el);
    el._x_ignore = void 0;
    el.removeAttribute(ignoreAttr);
    if (el.closest(`[${ignoreAttr}]`)) return;
    Alpine.initTree(el);
  }
  function handleAlias(name) {
    if (!alias || data[name]) return;
    if (typeof alias === "function") {
      Alpine.asyncData(name, alias);
    }
    if (typeof alias === "string") {
      Alpine.asyncUrl(name, alias.replaceAll("[name]", name));
    }
  }
  function parseName(attribute) {
    const parsedName = (attribute || "").split(/[({]/g)[0];
    const ourName = parsedName || `_x_async_${index()}`;
    return ourName;
  }
  function parseUrl(url) {
    if (options.keepRelativeURLs) return url;
    const absoluteReg = new RegExp("^(?:[a-z+]+:)?//", "i");
    if (!absoluteReg.test(url)) {
      return new URL(url, document.baseURI).href;
    }
    return url;
  }
}
export {
  async_alpine_default as default
};
