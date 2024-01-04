import { SecurityGroup, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export class VPCResources extends Construct {
  public fargateAlbSecurityGroup: SecurityGroup;
  public vpc: Vpc;
  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.vpc = new Vpc(this, 'VPC', {
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'PublicSubnet',
          subnetType: SubnetType.PUBLIC,
        },
      ],
      maxAzs: 2,
      natGateways: 0,
    });

    this.fargateAlbSecurityGroup = new SecurityGroup(
      this,
      'fargateAlbSecurityGroup',
      {
        vpc: this.vpc,
        description: 'Security Group for Fargate ALB',
      },
    );
  }
}
