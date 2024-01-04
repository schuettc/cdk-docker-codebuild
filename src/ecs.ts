import { SecurityGroup, Port, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import {
  AwsLogDriver,
  ContainerImage,
  CpuArchitecture,
  FargateTaskDefinition,
  OperatingSystemFamily,
  Cluster,
  FargateService,
} from 'aws-cdk-lib/aws-ecs';
import {
  ApplicationLoadBalancer,
  ApplicationProtocol,
  ApplicationTargetGroup,
  ListenerAction,
  ListenerCondition,
} from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import {
  ManagedPolicy,
  Role,
  ServicePrincipal,
  PolicyStatement,
} from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

interface ECSResourcesProps {
  vpc: Vpc;
  fargateAlbSecurityGroup: SecurityGroup;
  customHeader: string;
  randomString: string;
}

export class ECSResources extends Construct {
  fargateService: FargateService;
  cluster: Cluster;
  applicationLoadBalancer: ApplicationLoadBalancer;

  constructor(scope: Construct, id: string, props: ECSResourcesProps) {
    super(scope, id);

    this.cluster = new Cluster(this, 'Cluster', {
      vpc: props.vpc,
    });

    const taskRole = new Role(this, 'taskRole', {
      assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole',
        ),
      ],
    });

    const executionRolePolicy = new PolicyStatement({
      resources: ['*'],
      actions: [
        'ecr:GetAuthorizationToken',
        'ecr:BatchCheckLayerAvailability',
        'ecr:GetDownloadUrlForLayer',
        'ecr:BatchGetImage',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
      ],
    });

    this.applicationLoadBalancer = new ApplicationLoadBalancer(
      this,
      'applicationLoadBalancer',
      {
        vpc: props.vpc,
        vpcSubnets: { subnetType: SubnetType.PUBLIC },
        internetFacing: true,
        securityGroup: props.fargateAlbSecurityGroup,
      },
    );

    const taskDefinition = new FargateTaskDefinition(this, 'taskDefinition', {
      taskRole: taskRole,
      cpu: 2048,
      memoryLimitMiB: 4096,
      runtimePlatform: {
        cpuArchitecture: CpuArchitecture.ARM64,
        operatingSystemFamily: OperatingSystemFamily.LINUX,
      },
    });

    taskDefinition.addContainer('cdk-codebuild', {
      image: ContainerImage.fromRegistry(
        'public.ecr.aws/nginx/nginx:latest-arm64v8',
      ),
      portMappings: [{ containerPort: 80, hostPort: 80 }],
      logging: new AwsLogDriver({ streamPrefix: 'cdk-codebuild' }),
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://localhost/'],
      },
    });

    taskDefinition.addToExecutionRolePolicy(executionRolePolicy);

    const fargateSecurityGroup = new SecurityGroup(
      this,
      'fargateSecurityGroup',
      { vpc: props.vpc },
    );

    this.fargateService = new FargateService(this, 'fargateService', {
      cluster: this.cluster,
      taskDefinition: taskDefinition,
      desiredCount: 1,
      assignPublicIp: true,
      vpcSubnets: { subnetType: SubnetType.PUBLIC },
      securityGroups: [fargateSecurityGroup],
    });

    const targetGroup = new ApplicationTargetGroup(this, 'targetGroup', {
      vpc: props.vpc,
      port: 80,
      protocol: ApplicationProtocol.HTTP,
      targets: [this.fargateService],
      healthCheck: {
        path: '/',
        port: '80',
      },
    });

    const applicationLoadBalancerListener =
      this.applicationLoadBalancer.addListener(
        'applicationLoadBalancerListener',
        {
          port: 80,
          protocol: ApplicationProtocol.HTTP,
          open: true,
          defaultAction: ListenerAction.fixedResponse(403),
        },
      );

    applicationLoadBalancerListener.addAction('ForwardFromCloudFront', {
      action: ListenerAction.forward([targetGroup]),
      conditions: [
        ListenerCondition.httpHeader(props.customHeader, [props.randomString]),
      ],
      priority: 1,
    });

    fargateSecurityGroup.connections.allowFrom(
      props.fargateAlbSecurityGroup,
      Port.tcp(80),
    );
  }
}
