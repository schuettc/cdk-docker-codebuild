import { RemovalPolicy, Stack } from 'aws-cdk-lib';
import {
  Project,
  BuildSpec,
  Source,
  LinuxArmBuildImage,
} from 'aws-cdk-lib/aws-codebuild';
import { Artifact, Pipeline } from 'aws-cdk-lib/aws-codepipeline';
import {
  CodeBuildAction,
  EcsDeployAction,
  S3SourceAction,
  S3Trigger,
} from 'aws-cdk-lib/aws-codepipeline-actions';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { FargateService } from 'aws-cdk-lib/aws-ecs';
import {
  PolicyDocument,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from 'aws-cdk-lib/aws-iam';
import { Asset } from 'aws-cdk-lib/aws-s3-assets';
import { Construct } from 'constructs';

interface PipelineResourcesProps {
  fargateService: FargateService;
}
export class PipelineResources extends Construct {
  ecrRepository: Repository;

  constructor(scope: Construct, id: string, props: PipelineResourcesProps) {
    super(scope, id);

    this.ecrRepository = new Repository(this, 'ecrRepository', {
      imageScanOnPush: true,
      repositoryName: 'docker-codebuild',
      removalPolicy: RemovalPolicy.DESTROY,
      emptyOnDelete: true,
    });

    const bundle = new Asset(this, 'bundle', {
      path: 'src/resources/dockerExample',
    });

    const codeBuildRole = new Role(this, 'ecrRepositoryRole', {
      assumedBy: new ServicePrincipal('codebuild.amazonaws.com'),
      inlinePolicies: {
        ['codeBuildPolicy']: new PolicyDocument({
          statements: [
            new PolicyStatement({
              resources: ['*'],
              actions: ['*'],
            }),
            new PolicyStatement({
              resources: [
                `arn:aws:s3:::${bundle.s3BucketName}`,
                `arn:aws:s3:::${bundle.s3BucketName}/*`,
              ],
              actions: ['s3:GetObject'],
            }),
          ],
        }),
      },
    });

    this.ecrRepository.grantPush(codeBuildRole);

    const project = new Project(this, 'codeBuildProject', {
      role: codeBuildRole,
      buildSpec: BuildSpec.fromObject({
        version: '0.2',
        phases: {
          pre_build: {
            commands: [
              'echo Logging in to Amazon ECR...',
              'aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com',
            ],
          },
          build: {
            commands: [
              'echo Build started on `date`',
              'echo Building the Docker image...',
              'docker build -t $IMAGE_REPO_NAME:$IMAGE_TAG .',
              'docker tag $IMAGE_REPO_NAME:$IMAGE_TAG $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$IMAGE_REPO_NAME:$IMAGE_TAG',
            ],
          },
          post_build: {
            commands: [
              'echo Build completed on `date`',
              'echo Pushing the Docker image...',
              'docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/$IMAGE_REPO_NAME:$IMAGE_TAG',
              'echo Writing image definitions file...',
              'printf \'[{"name":"cdk-codebuild","imageUri":"%s"}]\' $IMAGE_REPO_URI:$IMAGE_TAG > imagedefinitions.json',
            ],
          },
        },
        artifacts: {
          files: ['imagedefinitions.json'],
        },
      }),
      source: Source.s3({
        bucket: bundle.bucket,
        path: bundle.s3ObjectKey,
      }),
      environment: {
        buildImage: LinuxArmBuildImage.AMAZON_LINUX_2_STANDARD_3_0,
        environmentVariables: {
          AWS_DEFAULT_REGION: { value: Stack.of(this).region },
          AWS_ACCOUNT_ID: { value: Stack.of(this).account },
          IMAGE_REPO_NAME: { value: this.ecrRepository.repositoryName },
          IMAGE_REPO_URI: { value: this.ecrRepository.repositoryUri },
          IMAGE_TAG: { value: 'latest' },
        },
      },
    });

    const sourceOutput = new Artifact();
    const buildOutput = new Artifact();
    const sourceAction = new S3SourceAction({
      actionName: 'S3Source',
      bucket: bundle.bucket,
      bucketKey: bundle.s3ObjectKey,
      output: sourceOutput,
      trigger: S3Trigger.EVENTS,
    });

    const buildAction = new CodeBuildAction({
      actionName: 'CodeBuild',
      project: project,
      input: sourceOutput,
      outputs: [buildOutput],
    });

    const deployAction = new EcsDeployAction({
      actionName: 'Deploy',
      service: props.fargateService,
      input: buildOutput,
    });

    new Pipeline(this, 'docker-codebuild-pipeline', {
      stages: [
        {
          stageName: 'source',
          actions: [sourceAction],
        },
        {
          stageName: 'build',
          actions: [buildAction],
        },
        {
          stageName: 'deploy',
          actions: [deployAction],
        },
      ],
    });
  }
}
