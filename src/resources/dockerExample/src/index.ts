/* eslint-disable import/no-unresolved */
import Fastify from 'fastify';

const fastify = Fastify({
  logger: true,
});

fastify.get('/demo', async (_request: any, reply: any) => {
  try {
    await reply.send({
      message: 'Request received. Docker functioning normally.',
    });
  } catch (error) {
    console.error('Error:', error);
    await reply.status(500).send({ error: 'Internal Server Error' });
  }
});

fastify.get('/', async (_request: any, reply: any) => {
  console.log('GET /');
  await reply.status(200).send('OK');
});

fastify.get('/health', async (_request: any, reply: any) => {
  console.log('GET /health');
  await reply.status(200).send('OK');
});

const start = async () => {
  try {
    await fastify.listen({ port: 80, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
void start();
