const request = require('supertest');
const app = require('../../src/app');

describe('Task Routes', () => {
  it('should respond with a list of tasks', (done) => {
    request(app)
      .get('/tasks')
      .expect(200)
      .end((err, res) => {
        if (err) return done(err);
        done();
      });
  });
});