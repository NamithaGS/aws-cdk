import * as zlib from 'zlib';
import { App, Stack } from '../lib';
import { formatAnalytics } from '../lib/private/metadata-resource';

// eslint-disable-next-line no-duplicate-imports, import/order
import { Construct } from '../lib';

describe('MetadataResource', () => {
  let app: App;
  let stack: Stack;

  beforeEach(() => {
    app = new App({
      analyticsReporting: true,
    });
    stack = new Stack(app, 'Stack');
  });

  test('is not included if the region is known and metadata is not available', () => {
    new Stack(app, 'StackUnavailable', {
      env: { region: 'definitely-no-metadata-resource-available-here' },
    });

    const stackTemplate = app.synth().getStackByName('StackUnavailable').template;

    expect(stackTemplate.Resources?.CDKMetadata).toBeUndefined();
  });

  test('is included if the region is known and metadata is available', () => {
    new Stack(app, 'StackPresent', {
      env: { region: 'us-east-1' },
    });

    const stackTemplate = app.synth().getStackByName('StackPresent').template;

    expect(stackTemplate.Resources?.CDKMetadata).toBeDefined();
  });

  test('is included if the region is unknown with conditions', () => {
    new Stack(app, 'StackUnknown');

    const stackTemplate = app.synth().getStackByName('StackUnknown').template;

    expect(stackTemplate.Resources?.CDKMetadata).toBeDefined();
    expect(stackTemplate.Resources?.CDKMetadata?.Condition).toBeDefined();
  });

  test('includes the formatted Analytics property', () => {
    // A very simple check that the jsii runtime psuedo-construct is present.
    // This check works whether we're running locally or on CodeBuild, on v1 or v2.
    // Other tests(in app.test.ts) will test version-specific results.
    expect(stackAnalytics()).toMatch(/v2:plaintext:.*jsii-runtime.Runtime.*/);
  });

  test('includes the current jsii runtime version', () => {
    process.env.JSII_AGENT = 'Java/1.2.3.4';

    expect(stackAnalytics()).toContain('Java/1.2.3.4!jsii-runtime.Runtime');
    delete process.env.JSII_AGENT;
  });

  test('includes constructs added to the stack', () => {
    new TestConstruct(stack, 'Test');

    expect(stackAnalytics()).toContain('1.2.3!@amzn/core.TestConstruct');
  });

  test('only includes constructs in the allow list', () => {
    new TestThirdPartyConstruct(stack, 'Test');

    expect(stackAnalytics()).not.toContain('TestConstruct');
  });

  function stackAnalytics(stackName: string = 'Stack') {
    return app.synth().getStackByName(stackName).template.Resources?.CDKMetadata?.Properties?.Analytics;
  }
});

describe('formatAnalytics', () => {
  test('single construct', () => {
    const constructInfo = [{ fqn: 'aws-cdk-lib.Construct', version: '1.2.3' }];

    expect(formatAnalytics(constructInfo, true)).toEqual('v2:plaintext:1.2.3!aws-cdk-lib.Construct');
  });

  test('common prefixes with same versions are combined', () => {
    const constructInfo = [
      { fqn: 'aws-cdk-lib.Construct', version: '1.2.3' },
      { fqn: 'aws-cdk-lib.CfnResource', version: '1.2.3' },
      { fqn: 'aws-cdk-lib.Stack', version: '1.2.3' },
    ];

    expect(formatAnalytics(constructInfo, true)).toEqual('v2:plaintext:1.2.3!aws-cdk-lib.{Construct,CfnResource,Stack}');
  });

  test('nested modules with common prefixes and same versions are combined', () => {
    const constructInfo = [
      { fqn: 'aws-cdk-lib.Construct', version: '1.2.3' },
      { fqn: 'aws-cdk-lib.CfnResource', version: '1.2.3' },
      { fqn: 'aws-cdk-lib.Stack', version: '1.2.3' },
      { fqn: 'aws-cdk-lib.aws_servicefoo.CoolResource', version: '1.2.3' },
      { fqn: 'aws-cdk-lib.aws_servicefoo.OtherResource', version: '1.2.3' },
    ];

    expect(formatAnalytics(constructInfo, true)).toEqual('v2:plaintext:1.2.3!aws-cdk-lib.{Construct,CfnResource,Stack,aws_servicefoo.{CoolResource,OtherResource}}');
  });

  test('constructs are grouped by version', () => {
    const constructInfo = [
      { fqn: 'aws-cdk-lib.Construct', version: '1.2.3' },
      { fqn: 'aws-cdk-lib.CfnResource', version: '1.2.3' },
      { fqn: 'aws-cdk-lib.Stack', version: '1.2.3' },
      { fqn: 'aws-cdk-lib.CoolResource', version: '0.1.2' },
      { fqn: 'aws-cdk-lib.OtherResource', version: '0.1.2' },
    ];

    expect(formatAnalytics(constructInfo, true)).toEqual('v2:plaintext:1.2.3!aws-cdk-lib.{Construct,CfnResource,Stack},0.1.2!aws-cdk-lib.{CoolResource,OtherResource}');
  });

  test('analytics are compressed and base64 encoded if that saves space', () => {
    const smallerConstructInfo = [...new Array(5).keys()].map((_, index) => { return { fqn: `aws-cdk-lib.Construct${index}`, version: '1.2.3' }; });
    const biggerConstructInfo = [...new Array(20).keys()].map((_, index) => { return { fqn: `aws-cdk-lib.Construct${index}`, version: '1.2.3' }; });

    expect(formatAnalytics(smallerConstructInfo)).toMatch(/v2:plaintext:.*/);

    const expectedPlaintext = '1.2.3!aws-cdk-lib.{' + [...new Array(20).keys()].map((_, index) => `Construct${index}`).join(',') + '}';
    const expectedCompressed = zlib.gzipSync(Buffer.from(expectedPlaintext)).toString('base64');
    expect(formatAnalytics(biggerConstructInfo)).toEqual(`v2:deflate64:${expectedCompressed}`);
  });
});

const JSII_RUNTIME_SYMBOL = Symbol.for('jsii.rtti');

class TestConstruct extends Construct {
  // @ts-ignore
  private static readonly [JSII_RUNTIME_SYMBOL] = { fqn: '@amzn/core.TestConstruct', version: '1.2.3' }
}

class TestThirdPartyConstruct extends Construct {
  // @ts-ignore
  private static readonly [JSII_RUNTIME_SYMBOL] = { fqn: 'mycoolthing.TestConstruct', version: '1.2.3' }
}

