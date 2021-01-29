import { IConstruct } from '../construct-compat';
import { Stack } from '../stack';

const ALLOWED_FQN_PREFIXES = [
  // SCOPES
  '@aws-cdk/', '@aws-cdk-containers/', '@aws-solutions-konstruk/', '@aws-solutions-constructs/', '@amzn/',
  // PACKAGES
  'aws-rfdk.', 'aws-cdk-lib.', 'monocdk.',
];

/**
 * Symbol for accessing jsii runtime information
 *
 * Introduced in jsii 1.19.0, cdk 1.90.0.
 */
const JSII_RUNTIME_SYMBOL = Symbol.for('jsii.rtti');

/**
 * Source information on a construct (class fqn and version)
 */
export interface ConstructInfo {
  readonly fqn: string;
  readonly version: string;
}

export function constructInfoFromConstruct(construct: IConstruct): ConstructInfo | undefined {
  const jsiiRuntimeInfo = Object.getPrototypeOf(construct).constructor[JSII_RUNTIME_SYMBOL];
  if (typeof jsiiRuntimeInfo === 'object'
    && jsiiRuntimeInfo !== null
    && typeof jsiiRuntimeInfo.fqn === 'string'
    && typeof jsiiRuntimeInfo.version === 'string') {
    return { fqn: jsiiRuntimeInfo.fqn, version: jsiiRuntimeInfo.version };
  }
  return undefined;
}

/**
 * For a given stack, walks the tree and finds the runtime info for all constructs within the tree.
 * Returns the unique list of construct info present in the stack,
 * as long as the construct fully-qualified names match the defined allow list.
 */
export function constructInfoFromStack(stack: Stack): ConstructInfo[] {
  function isConstructInfo(value: ConstructInfo | undefined): value is ConstructInfo {
    return value !== undefined;
  }

  const allConstructInfos = stack.node.findAll()
    .map(construct => constructInfoFromConstruct(construct))
    .filter(isConstructInfo) // Type simplification
    .filter(info => ALLOWED_FQN_PREFIXES.find(prefix => info.fqn.startsWith(prefix)));

  // Adds the jsii runtime as a psuedo construct for reporting purposes.
  allConstructInfos.push({
    fqn: 'jsii-runtime.Runtime',
    version: getJsiiAgentVersion(),
  });

  // Filter out duplicate values
  return allConstructInfos.filter((info, index) => index === allConstructInfos.findIndex(i => i.fqn === info.fqn && i.version === info.version));
}

function getJsiiAgentVersion() {
  let jsiiAgent = process.env.JSII_AGENT;

  // if JSII_AGENT is not specified, we will assume this is a node.js runtime
  // and plug in our node.js version
  if (!jsiiAgent) {
    jsiiAgent = `node.js/${process.version}`;
  }

  return jsiiAgent;
}
