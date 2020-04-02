// Express docs: http://expressjs.com/en/api.html
const express = require('express')
// Passport docs: http://www.passportjs.org/docs/
const passport = require('passport')

// pull in Mongoose model for scorelists
const Scorelist = require('../models/scorelist')

// this is a collection of methods that help us detect situations when we need
// to throw a custom error
const customErrors = require('../../lib/custom_errors')

// we'll use this function to send 404 when non-existant document is requested
const handle404 = customErrors.handle404
// we'll use this function to send 401 when a user tries to modify a resource
// that's owned by someone else
const requireOwnership = customErrors.requireOwnership

// this is middleware that will remove blank fields from `req.body`, e.g.
// { scorelist: { title: '', text: 'foo' } } -> { scorelist: { text: 'foo' } }
const removeBlanks = require('../../lib/remove_blank_fields')
// passing this as a second argument to `router.<verb>` will make it
// so that a token MUST be passed for that route to be available
// it will also set `req.user`
const requireToken = passport.authenticate('bearer', { session: false })

// instantiate a router (mini app that only handles routes)
const router = express.Router()

// INDEX
// GET /scorelists
router.get('/scorelists', (req, res, next) => {
  Scorelist.find()
    .then(scorelists => {
      // `scorelists` will be an array of Mongoose documents
      // we want to convert each one to a POJO, so we use `.map` to
      // apply `.toObject` to each one
      return scorelists.map(scorelist => scorelist.toObject())
    })
    // respond with status 200 and JSON of the scorelists
    .then(scorelists => {
      if (scorelists.length > 10) {
        scorelists = scorelists.splice(0, 10)
      }
      scorelists = scorelists.sort(function (a, b) {
        return a.score - b.score
      })
      for (let i = 0; i < 10; i++) {
        let j = i + 1
        scorelists[i].placement = j
      }
      res.status(200).json({ scorelists: scorelists })
    })
    // if an error occurs, pass it to the handler
    .catch(next)
})

// SHOW
// GET /scorelists/5a7db6c74d55bc51bdf39793
router.get('/scorelists/:id', requireToken, (req, res, next) => {
  // req.params.id will be set based on the `:id` in the route
  Scorelist.findById(req.params.id)
    .then(handle404)
    // if `findById` is succesful, respond with 200 and "scorelist" JSON
    .then(scorelist => res.status(200).json({ scorelist: scorelist.toObject() }))
    // if an error occurs, pass it to the handler
    .catch(next)
})

// CREATE
// POST /scorelists
router.post('/scorelists', requireToken, (req, res, next) => {
  // set owner of new scorelist to be current user
  req.body.scorelist.owner = req.user.id
  console.log('hello')
  Scorelist.create(req.body.scorelist)
    // respond to succesful `create` with status 201 and JSON of new "scorelist"
    .then(scorelist => {
      res.status(201).json({ scorelist: scorelist.toObject() })
    })
    // if an error occurs, pass it off to our error handler
    // the error handler needs the error message and the `res` object so that it
    // can send an error message back to the client
    .catch(next)
})

// UPDATE
// PATCH /scorelists/5a7db6c74d55bc51bdf39793
router.patch('/scorelists/:id', requireToken, removeBlanks, (req, res, next) => {
  // if the client attempts to change the `owner` property by including a new
  // owner, prevent that by deleting that key/value pair
  delete req.body.scorelist.owner

  Scorelist.findById(req.params.id)
    .then(handle404)
    .then(scorelist => {
      // pass the `req` object and the Mongoose record to `requireOwnership`
      // it will throw an error if the current user isn't the owner
      requireOwnership(req, scorelist)

      // pass the result of Mongoose's `.update` to the next `.then`
      return scorelist.updateOne(req.body.scorelist)
    })
    // if that succeeded, return 204 and no JSON
    .then(() => res.sendStatus(204))
    // if an error occurs, pass it to the handler
    .catch(next)
})

// DESTROY
// DELETE /scorelists/5a7db6c74d55bc51bdf39793
router.delete('/scorelists/:id', requireToken, (req, res, next) => {
  Scorelist.findById(req.params.id)
    .then(handle404)
    .then(scorelist => {
      // throw an error if current user doesn't own `scorelist`
      requireOwnership(req, scorelist)
      // delete the scorelist ONLY IF the above didn't throw
      scorelist.deleteOne()
    })
    // send back 204 and no content if the deletion succeeded
    .then(() => res.sendStatus(204))
    // if an error occurs, pass it to the handler
    .catch(next)
})

module.exports = router
