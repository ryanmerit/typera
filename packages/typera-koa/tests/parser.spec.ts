import * as t from 'io-ts'
import { IntFromString } from 'io-ts-types/lib/IntFromString'
import { Parser, Response, Route, router, route } from '..'
import * as request from 'supertest'
import { makeServer } from './utils'

describe('parsers', () => {
  let server: ReturnType<typeof makeServer> | null = null

  afterEach(() => {
    if (server) {
      server.close()
      server = null
    }
  })

  describe('cookies', () => {
    // koa's cookie parsing has extra logic

    const setup = <T>(codec: t.Type<T, any, unknown>) => {
      const parseCookies: Route<Response.Ok<T> | Response.BadRequest<string>> =
        route
          .get('/parse-cookies')
          .use(Parser.cookies(codec))
          .handler((request) => {
            return Response.ok(request.cookies)
          })
      server = makeServer(router(parseCookies).handler())
    }

    it('one cookie', async () => {
      setup(t.type({ Authorization: t.string }))

      await request(server)
        .get('/parse-cookies')
        .set('Cookie', 'Authorization=foobar')
        .expect(200, { Authorization: 'foobar' })
    })
    it('two cookies', async () => {
      setup(t.strict({ Authorization: t.string, 'X-Foo-Bar': t.string }))

      await request(server)
        .get('/parse-cookies')
        .set(
          'Cookie',
          'X-Foo-Bar=something; Authorization=other; irrelevant-header=quux'
        )
        .expect(200, { Authorization: 'other', 'X-Foo-Bar': 'something' })
    })
    it('error handling', async () => {
      setup(t.strict({ Authorization: t.string }))
      await request(server)
        .get('/parse-cookies')
        .expect(400, /^Invalid cookies: /)
    })
  })

  describe('headers', () => {
    it('simple', async () => {
      const parseHeaders: Route<
        Response.Ok<{ foo: string }> | Response.BadRequest<string>
      > = route
        .get('/parse-headers')
        .use(Parser.headers(t.type({ foo: t.string })))
        .handler((request) => {
          return Response.ok({
            foo: request.headers.foo,
          })
        })
      server = makeServer(router(parseHeaders).handler())

      await request(server)
        .get('/parse-headers')
        .set('foo', 'bar')
        .expect(200, { foo: 'bar' })

      await request(server).get('/parse-headers').expect(400)
    })

    it('case insensitive', async () => {
      const test: Route<
        | Response.Ok<{
            'API-KEY': string
            'api-key': string
            'aPi-KeY': string
          }>
        | Response.BadRequest<string>
      > = route
        .get('/headers')
        .use(
          Parser.headers(
            t.type({
              'API-KEY': t.string,
              'api-key': t.string,
              'aPi-KeY': t.string,
            })
          )
        )
        .handler(async (request) => {
          return Response.ok(request.headers)
        })

      server = makeServer(router(test).handler())

      await request(server)
        .get('/headers')
        .set('API-KEY', 'foo')
        .set('This-Will-Be', 'removed')
        .expect(200, { 'API-KEY': 'foo', 'api-key': 'foo', 'aPi-KeY': 'foo' })
    })

    it('complex codec', async () => {
      const test: Route<
        | Response.Ok<{ 'API-Key': string; 'X-Foo'?: number }>
        | Response.BadRequest<string>
      > = route
        .get('/headers')
        .use(
          Parser.headers(
            t.exact(
              t.intersection([
                t.type({ 'API-Key': t.string }),
                t.partial({ 'X-Foo': IntFromString }),
              ])
            )
          )
        )
        .handler(async (request) => Response.ok(request.headers))

      server = makeServer(router(test).handler())

      await request(server)
        .get('/headers')
        .set('API-Key', 'foo')
        .set('X-Foo', '123')
        .set('This-Will-Be', 'removed')
        .expect(200, { 'API-Key': 'foo', 'X-Foo': 123 })
    })
  })
})
