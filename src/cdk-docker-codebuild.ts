import { randomBytes } from 'crypto';
import { App, CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  ECSResources,
  VPCResources,
  DistributionResources,
  PipelineResources,
} from './index';

export class DockerCodeBuild extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);
    const vpcResources = new VPCResources(this, 'vpcResources');

    const randomString = generateRandomString(8);
    const customHeader = 'X-From-CloudFront';

    const ecsResources = new ECSResources(this, 'ecsResources', {
      vpc: vpcResources.vpc,
      fargateAlbSecurityGroup: vpcResources.fargateAlbSecurityGroup,
      customHeader: customHeader,
      randomString: randomString,
    });

    new PipelineResources(this, 'pipelineResources', {
      fargateService: ecsResources.fargateService,
    });

    const distribution = new DistributionResources(
      this,
      'distributionResources',
      {
        fargateService: ecsResources.fargateService,
        applicationLoadBalancer: ecsResources.applicationLoadBalancer,
        customHeader: customHeader,
        randomString: randomString,
      },
    );

    new CfnOutput(this, 'distributionDomainName', {
      value: distribution.distribution.distributionDomainName,
    });
  }
}

function generateRandomString(length: number): string {
  const randomBytesArray = randomBytes(length);
  const charset =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';

  for (let i = 0; i < length; i++) {
    const randomIndex = randomBytesArray[i] % charset.length;
    result += charset.charAt(randomIndex);
  }

  return result;
}

const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const app = new App();

new DockerCodeBuild(app, 'cdk-docker-codebuild-dev', { env: devEnv });

app.synth();
