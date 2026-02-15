import { config, collection, fields } from '@keystatic/core';

export default config({
  storage: {
    kind: 'local',
  },
  collections: {
    games: collection({
      label: 'Games',
      slugField: 'name',
      path: 'src/content/games/*',
      format: { contentField: 'description' },
      schema: {
        name: fields.slug({
          name: {
            label: 'Name',
            validation: { isRequired: true },
          },
        }),
        image: fields.image({
          label: 'Image',
          directory: 'public/images/games',
          publicPath: '/images/games/',
          validation: { isRequired: true },
        }),
        imageAlt: fields.text({
          label: 'Image Alt Text',
          validation: { isRequired: true },
        }),
        youtubeLink: fields.url({
          label: 'YouTube Link',
        }),
        description: fields.markdoc({
          label: 'Description',
          options: {
            image: {
              directory: 'public/images/games',
              publicPath: '/images/games/',
            },
          },
        }),
        tag: fields.relationship({
          label: 'Primary Tag',
          collection: 'tags',
          validation: { isRequired: true },
        }),
        tags: fields.array(
          fields.relationship({
            label: 'Tag',
            collection: 'tags',
          }),
          {
            label: 'Additional Tags',
            itemLabel: (props) => props.value || 'Tag',
          }
        ),
        editeur: fields.relationship({
          label: 'Publisher',
          collection: 'editeurs',
        }),
        players: fields.text({
          label: 'Number of Players',
        }),
        duration: fields.text({
          label: 'Duration',
        }),
        difficulty: fields.integer({
          label: 'Difficulty',
          validation: {
            min: 1,
            max: 5,
          },
        }),
        age: fields.text({
          label: 'Age',
        }),
      },
    }),
    tags: collection({
      label: 'Tags',
      slugField: 'title',
      path: 'src/content/tags/*',
      format: { data: true },
      schema: {
        title: fields.slug({
          name: {
            label: 'Title',
            validation: { isRequired: true },
          },
        }),
      },
    }),
    editeurs: collection({
      label: 'Publishers',
      slugField: 'name',
      path: 'src/content/editeurs/*',
      format: { data: true },
      schema: {
        name: fields.slug({
          name: {
            label: 'Name',
            validation: { isRequired: true },
          },
        }),
      },
    }),
  },
});
